/**
 * Content Extractor
 * Extracts structured content from PDF pages using StructTree + TextContent
 */

import type {
  ContentElement,
  HeadingElement,
  ParagraphElement,
  ListElement,
  TableElement,
  NoteElement,
} from '../types/index.js';
import type {
  PDFDocumentProxy,
  PDFPageProxy,
  StructTreeNode,
  StructTreeContent,
  TextItem,
  TextMarkedContent,
  TextContent,
} from './pdf-loader.js';

type TextContentItem = TextItem | TextMarkedContent;

/**
 * Extract structured content from a range of pages
 */
export async function extractSectionContent(
  doc: PDFDocumentProxy,
  startPage: number,
  endPage: number,
): Promise<ContentElement[]> {
  const elements: ContentElement[] = [];

  for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
    const pageElements = await extractPageContent(doc, pageNum);
    elements.push(...pageElements);
  }

  return elements;
}

/**
 * Extract structured content from a single page
 */
async function extractPageContent(
  doc: PDFDocumentProxy,
  pageNum: number,
): Promise<ContentElement[]> {
  const page = await doc.getPage(pageNum);

  const [structTree, textContent] = await Promise.all([
    page.getStructTree(),
    page.getTextContent({ includeMarkedContent: true }),
  ]);

  if (!structTree) {
    // Fallback: no struct tree, return plain text
    return extractPlainText(textContent);
  }

  // Build marked content ID -> text mapping
  const textMap = buildTextMap(textContent.items);

  // Walk struct tree and produce content elements
  return walkStructTree(structTree, textMap, textContent.styles);
}

/**
 * Build mapping from marked content ID to concatenated text
 */
function buildTextMap(items: TextContentItem[]): Map<string, string> {
  const map = new Map<string, string>();
  let currentId: string | null = null;
  let currentTexts: string[] = [];

  for (const item of items) {
    if (isMarkedContent(item)) {
      if (item.type === 'beginMarkedContentProps' && item.id !== undefined) {
        // Save previous
        if (currentId !== null && currentTexts.length > 0) {
          map.set(currentId, currentTexts.join(''));
        }
        currentId = item.id;
        currentTexts = [];
      } else if (item.type === 'endMarkedContent') {
        if (currentId !== null && currentTexts.length > 0) {
          map.set(currentId, currentTexts.join(''));
        }
        currentId = null;
        currentTexts = [];
      }
    } else if (isTextItem(item)) {
      if (currentId !== null) {
        currentTexts.push(item.str);
        if (item.hasEOL) {
          currentTexts.push('\n');
        }
      }
    }
  }

  // Flush remaining
  if (currentId !== null && currentTexts.length > 0) {
    map.set(currentId, currentTexts.join(''));
  }

  return map;
}

/**
 * Walk the structure tree and produce content elements
 */
function walkStructTree(
  node: StructTreeNode,
  textMap: Map<string, string>,
  styles: TextContent['styles'],
): ContentElement[] {
  const elements: ContentElement[] = [];

  if (!node.children) return elements;

  for (const child of node.children) {
    if (isStructContent(child)) {
      // Leaf content node — will be collected by parent
      continue;
    }

    const role = child.role;

    // Skip artifacts (headers, footers, page numbers)
    if (role === 'Artifact') continue;

    // Heading elements (H1-H6, H)
    if (/^H[1-6]?$/.test(role)) {
      const text = collectText(child, textMap).trim();
      if (text) {
        const level = role.length === 2 ? parseInt(role[1]) : 3;
        elements.push({ type: 'heading', level, text } as HeadingElement);
      }
      continue;
    }

    // Paragraph
    if (role === 'P') {
      const text = collectText(child, textMap).trim();
      if (!text) continue;

      // Detect NOTE/EXAMPLE
      const noteMatch = text.match(/^(NOTE\s*\d*|EXAMPLE\s*\d*)\s+/i);
      if (noteMatch) {
        elements.push({
          type: 'note',
          label: noteMatch[1],
          text: text.substring(noteMatch[0].length).trim(),
        } as NoteElement);
        continue;
      }

      elements.push({ type: 'paragraph', text } as ParagraphElement);
      continue;
    }

    // List
    if (role === 'L') {
      const items = collectListItems(child, textMap);
      if (items.length > 0) {
        elements.push({ type: 'list', items } as ListElement);
      }
      continue;
    }

    // Table
    if (role === 'Table') {
      const table = collectTable(child, textMap);
      if (table) {
        elements.push(table);
      }
      continue;
    }

    // Code (Figure role with monospace content, or explicit Code role)
    if (role === 'Code') {
      const text = collectText(child, textMap).trim();
      if (text) {
        elements.push({ type: 'code', text });
      }
      continue;
    }

    // Recurse into container elements (Document, Part, Sect, Div, etc.)
    const childElements = walkStructTree(child, textMap, styles);
    elements.push(...childElements);
  }

  return elements;
}

/**
 * Collect all text from a struct tree node and its descendants
 */
function collectText(node: StructTreeNode, textMap: Map<string, string>): string {
  const parts: string[] = [];

  if (node.children) {
    for (const child of node.children) {
      if (isStructContent(child)) {
        const text = textMap.get(child.id);
        if (text) parts.push(text);
      } else {
        // Skip Artifact children
        if (child.role === 'Artifact') continue;
        parts.push(collectText(child, textMap));
      }
    }
  }

  return parts.join('');
}

/**
 * Collect list items from L element
 */
function collectListItems(node: StructTreeNode, textMap: Map<string, string>): string[] {
  const items: string[] = [];

  if (node.children) {
    for (const child of node.children) {
      if (isStructContent(child)) continue;
      if (child.role === 'LI') {
        // LI may contain Lbl (label) and LBody
        const bodyText = collectListItemBody(child, textMap);
        if (bodyText.trim()) {
          items.push(bodyText.trim());
        }
      }
    }
  }

  return items;
}

function collectListItemBody(li: StructTreeNode, textMap: Map<string, string>): string {
  const parts: string[] = [];
  if (li.children) {
    for (const child of li.children) {
      if (isStructContent(child)) {
        const text = textMap.get(child.id);
        if (text) parts.push(text);
      } else if (child.role === 'LBody') {
        parts.push(collectText(child, textMap));
      } else if (child.role === 'Lbl') {
        // Skip bullet/number labels
      } else {
        parts.push(collectText(child, textMap));
      }
    }
  }
  return parts.join('');
}

/**
 * Collect table structure from Table element
 */
function collectTable(
  node: StructTreeNode,
  textMap: Map<string, string>,
): TableElement | null {
  const headers: string[] = [];
  const rows: string[][] = [];
  let isFirstRow = true;

  if (!node.children) return null;

  for (const child of node.children) {
    if (isStructContent(child)) continue;

    if (child.role === 'TR') {
      const cells: string[] = [];
      let hasHeaders = false;

      if (child.children) {
        for (const cell of child.children) {
          if (isStructContent(cell)) continue;
          const text = collectText(cell, textMap).trim();
          if (cell.role === 'TH') {
            hasHeaders = true;
          }
          cells.push(text);
        }
      }

      if (hasHeaders && isFirstRow) {
        headers.push(...cells);
      } else {
        rows.push(cells);
      }
      isFirstRow = false;
    }
  }

  if (headers.length === 0 && rows.length === 0) return null;

  return { type: 'table', headers, rows };
}

/**
 * Fallback: extract plain text without struct tree
 */
function extractPlainText(textContent: TextContent): ContentElement[] {
  const texts: string[] = [];
  for (const item of textContent.items) {
    if (isTextItem(item)) {
      texts.push(item.str);
      if (item.hasEOL) texts.push('\n');
    }
  }
  const text = texts.join('').trim();
  if (!text) return [];
  return [{ type: 'paragraph', text }];
}

// Type guards
function isTextItem(item: TextContentItem): item is TextItem {
  return 'str' in item;
}

function isMarkedContent(item: TextContentItem): item is TextMarkedContent {
  return 'type' in item;
}

function isStructContent(
  child: StructTreeNode | StructTreeContent,
): child is StructTreeContent {
  return 'type' in child && (child as StructTreeContent).type === 'content';
}
