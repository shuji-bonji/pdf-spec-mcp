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
  StructTreeNode,
  StructTreeContent,
  TextItem,
  TextMarkedContent,
  TextContent,
} from './pdf-loader.js';
import { CONCURRENCY } from '../config.js';
import { mapConcurrent } from '../utils/concurrency.js';

type TextContentItem = TextItem | TextMarkedContent;

/**
 * Extract structured content from a range of pages.
 * Uses chunked parallel processing for multi-page ranges.
 * @param sectionNumber - If provided, skip content before this section's heading on the first page
 */
export async function extractSectionContent(
  doc: PDFDocumentProxy,
  startPage: number,
  endPage: number,
  sectionNumber?: string
): Promise<ContentElement[]> {
  // Clamp page range to valid bounds (defensive against outline/PagesMapper issues)
  const totalPages = doc.numPages || endPage;
  const safeStart = Math.max(1, Math.min(startPage, totalPages));
  const safeEnd = Math.max(1, Math.min(endPage, totalPages));

  const pageNumbers = Array.from({ length: safeEnd - safeStart + 1 }, (_, i) => safeStart + i);

  // mapConcurrent preserves input order, so page order is maintained
  const pageResults = await mapConcurrent(
    pageNumbers,
    (pageNum) => extractPageContent(doc, pageNum),
    CONCURRENCY.contentExtraction
  );

  const elements = pageResults.flat();

  // Skip content from previous sections on the first page
  if (sectionNumber) {
    return trimToSectionStart(elements, sectionNumber);
  }

  return elements;
}

/**
 * Remove content elements that precede the target section heading
 */
function trimToSectionStart(elements: ContentElement[], sectionNumber: string): ContentElement[] {
  const headingIdx = elements.findIndex(
    (el) => el.type === 'heading' && el.text.startsWith(sectionNumber + ' ')
  );

  // Also try matching "Annex X" format
  if (headingIdx === -1 && sectionNumber.startsWith('Annex ')) {
    const annexIdx = elements.findIndex(
      (el) => el.type === 'heading' && el.text.startsWith(sectionNumber)
    );
    if (annexIdx > 0) return elements.slice(annexIdx);
  }

  if (headingIdx > 0) {
    return elements.slice(headingIdx);
  }

  return elements;
}

/**
 * Extract structured content from a single page
 */
async function extractPageContent(
  doc: PDFDocumentProxy,
  pageNum: number
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
  styles: TextContent['styles']
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
function collectTable(node: StructTreeNode, textMap: Map<string, string>): TableElement | null {
  const headers: string[] = [];
  const rows: string[][] = [];

  if (!node.children) return null;

  // Collect TR rows, handling both direct TR children and THead/TBody wrappers
  const headRows: StructTreeNode[] = [];
  const bodyRows: StructTreeNode[] = [];

  for (const child of node.children) {
    if (isStructContent(child)) continue;

    if (child.role === 'TR') {
      // Direct TR child (no THead/TBody wrapper)
      bodyRows.push(child);
    } else if (child.role === 'THead') {
      // THead wrapper — collect TR children as header rows
      if (child.children) {
        for (const tr of child.children) {
          if (!isStructContent(tr) && tr.role === 'TR') {
            headRows.push(tr);
          }
        }
      }
    } else if (child.role === 'TBody' || child.role === 'TFoot') {
      // TBody/TFoot wrapper — collect TR children as data rows
      if (child.children) {
        for (const tr of child.children) {
          if (!isStructContent(tr) && tr.role === 'TR') {
            bodyRows.push(tr);
          }
        }
      }
    }
  }

  // Extract header cells from THead rows
  for (const tr of headRows) {
    if (tr.children) {
      const cells: string[] = [];
      for (const cell of tr.children) {
        if (isStructContent(cell)) continue;
        cells.push(collectText(cell, textMap).trim());
      }
      if (cells.length > 0 && headers.length === 0) {
        headers.push(...cells);
      } else if (cells.length > 0) {
        rows.push(cells);
      }
    }
  }

  // If no THead, use first body row with all-TH cells as header
  let firstBodyIsHeader = false;
  if (headers.length === 0 && bodyRows.length > 0) {
    const firstRow = bodyRows[0];
    if (firstRow.children) {
      const allTH = firstRow.children
        .filter((c) => !isStructContent(c))
        .every((c) => (c as StructTreeNode).role === 'TH');
      if (allTH) {
        const cells: string[] = [];
        for (const cell of firstRow.children) {
          if (isStructContent(cell)) continue;
          cells.push(collectText(cell, textMap).trim());
        }
        headers.push(...cells);
        firstBodyIsHeader = true;
      }
    }
  }

  // Extract body row cells
  for (let i = firstBodyIsHeader ? 1 : 0; i < bodyRows.length; i++) {
    const tr = bodyRows[i];
    if (tr.children) {
      const cells: string[] = [];
      for (const cell of tr.children) {
        if (isStructContent(cell)) continue;
        cells.push(collectText(cell, textMap).trim());
      }
      if (cells.length > 0) {
        rows.push(cells);
      }
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

function isStructContent(child: StructTreeNode | StructTreeContent): child is StructTreeContent {
  return 'type' in child && (child as StructTreeContent).type === 'content';
}
