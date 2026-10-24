/**
 * Content Extractor
 * Extracts structured content from PDF pages using StructTree + TextContent
 */

import { CONCURRENCY } from '../config.js';
import type {
  ContentElement,
  HeadingElement,
  ListElement,
  NoteElement,
  ParagraphElement,
  SectionIndex,
  TableElement,
} from '../types/index.js';
import { mapConcurrent } from '../utils/concurrency.js';
import type {
  PDFDocumentProxy,
  StructTreeContent,
  StructTreeNode,
  TextContent,
  TextItem,
  TextMarkedContent,
} from './pdf-loader.js';

type TextContentItem = TextItem | TextMarkedContent;

/**
 * Section key → title, from the outline, so that a paragraph whose text is a section
 * heading can be recognised as one (#15).
 *
 * ISO 32000-2 tags its headings as H1–H6, and walkStructTree makes heading elements only
 * from those. The Adobe-published ISO 32000-1 (PDF32000_2008.pdf) has no H element on
 * any of its 756 pages: every heading is a P whose text is "9.6.4 Font Subsets". With no
 * heading element on the page, findSectionHeadingIndex never finds a cut, so all three
 * boundary operations keep whole pages and every section carries its neighbours
 * (602 of 823 sections share a page with one). Hints let walkStructTree promote such a
 * P to a heading — the one rule, in one place, that the three operations then share.
 *
 * Keys are the outline keys (section number, or the full title for Annex subsections such
 * as "C.1 General"); values are the titles with the number stripped.
 */
export type HeadingHints = ReadonlyMap<string, string>;

export function headingHintsFromIndex(index: SectionIndex): HeadingHints {
  const hints = new Map<string, string>();
  for (const info of index.flatOrder) {
    hints.set(info.sectionNumber, info.title);
  }
  return hints;
}

/**
 * Extract structured content from a range of pages.
 * Uses chunked parallel processing for multi-page ranges.
 * @param sectionNumber - If provided, skip content before this section's heading on the first page
 * @param hints - Outline-derived heading hints (see HeadingHints)
 */
export async function extractSectionContent(
  doc: PDFDocumentProxy,
  startPage: number,
  endPage: number,
  sectionNumber?: string,
  hints?: HeadingHints,
): Promise<ContentElement[]> {
  // Clamp page range to valid bounds (defensive against outline/PagesMapper issues)
  const totalPages = doc.numPages || endPage;
  const safeStart = Math.max(1, Math.min(startPage, totalPages));
  const safeEnd = Math.max(1, Math.min(endPage, totalPages));

  const pageNumbers = Array.from({ length: safeEnd - safeStart + 1 }, (_, i) => safeStart + i);

  // mapConcurrent preserves input order, so page order is maintained
  const pageResults = await mapConcurrent(
    pageNumbers,
    (pageNum) => extractPageContent(doc, pageNum, hints),
    CONCURRENCY.contentExtraction,
  );

  const elements = pageResults.flat();

  // Skip content from previous sections on the first page
  if (sectionNumber) {
    return trimToSectionStart(elements, sectionNumber);
  }

  return elements;
}

/**
 * Where a section's heading sits among a page's elements, or -1 if it is not there.
 *
 * Single source of truth for "this section starts here", so that trimToSectionStart and
 * extractOrphanedStrip stay exact complements of each other — see extractOrphanedStrip.
 */
export function findSectionHeadingIndex(elements: ContentElement[], sectionNumber: string): number {
  // The key must be followed by a boundary (space, line break, or end of text), not by an
  // arbitrary character: "7.3" must not match "7.3.4 String objects". The old rule
  // demanded a trailing space, which silently failed for two shapes (SV-1):
  //   - "Annex A" headings render as "Annex A\n(informative)\n…" (line break, not space)
  //   - Annex subsections have no section number in the outline, so their key is the full
  //     title ("A.1 General") and the heading text equals it exactly (end of text).
  // A miss here means trimToSectionStart keeps the whole shared page for BOTH the parent
  // and the child — 51 sections of ISO 32000-2 double-held their first page this way.
  return elements.findIndex((el) => {
    if (el.type !== 'heading') return false;
    if (!el.text.startsWith(sectionNumber)) return false;
    const after = el.text.charAt(sectionNumber.length);
    return after === '' || after === ' ' || after === '\n';
  });
}

/**
 * Remove content elements that precede the target section heading
 */
function trimToSectionStart(elements: ContentElement[], sectionNumber: string): ContentElement[] {
  const headingIdx = findSectionHeadingIndex(elements, sectionNumber);
  return headingIdx > 0 ? elements.slice(headingIdx) : elements;
}

/**
 * Remove content elements at and after the *next* section's heading (S-9, symptom 2).
 *
 * When two sections share a page (endPage === next.page), this section's range covers the
 * whole page, so without an end cut it also carries everything belonging to the next
 * section: get_tables("8.4.3.3") returned Table 54 — 8.4.3.4's table — as an incomplete
 * duplicate (Miter join only, no Round/Bevel), under its correct caption. The same
 * double attribution reached get_section and get_requirements.
 *
 * This is the exact mirror of trimToSectionStart, deciding via the same
 * findSectionHeadingIndex (the S-5 rule: one rule, one place):
 *   - heading found     → everything from it on belongs to the next section; cut it
 *                         (trimToSectionStart keeps exactly that part for the next
 *                         section, so the page is partitioned, not duplicated)
 *   - heading not found → keep everything. The next section keeps the whole page too
 *                         (its trimToSectionStart finds nothing to cut), so cutting here
 *                         would lose the text entirely — duplication is the lesser harm,
 *                         and it is the pre-existing arm for headingless sections.
 */
export function trimAfterNextSectionStart(
  elements: ContentElement[],
  nextSectionNumber: string,
): ContentElement[] {
  const headingIdx = findSectionHeadingIndex(elements, nextSectionNumber);
  return headingIdx >= 0 ? elements.slice(0, headingIdx) : elements;
}

/**
 * The content `trimToSectionStart` throws away at the top of `seamPage` — the tail of the
 * *previous* section, which spilled past its last page.
 *
 * Section ranges come from the outline as `[page, nextSection.page - 1]`, so anything a
 * section runs over onto the next section's first page falls outside its own range. The
 * next section then discards it as pre-heading content. Nobody keeps it: 412 sections of
 * ISO 32000-2 lose content this way, 271 of them requirement text ("shall"), plus the
 * table rows that B-S1 first surfaced.
 *
 * Returning it here lets the previous section adopt it, and **cannot double-count**: this
 * returns a non-empty strip exactly when trimToSectionStart drops one, both deciding via
 * findSectionHeadingIndex.
 *   - heading at index > 0 → trimmed away there, adopted here
 *   - heading at index 0   → nothing precedes it; both return nothing
 *   - heading not found    → trimToSectionStart keeps the whole page, so the next section
 *                            already owns this content (69 sections of ISO 32000-2).
 *                            Adopting it here too would duplicate it — hence `[]`.
 *
 * The `> 0` above is for clarity, not safety: `>= 0` and `!== -1` behave identically, since
 * `slice(0, 0)` is empty and a `-1` index never reaches the slice. What must not change is
 * the "not found → adopt nothing" arm, and that the heading is located the same way as in
 * trimToSectionStart. Both are pinned by tests.
 */
export interface OrphanedStrip {
  /** The strip: elements above the next section's heading. Empty unless the heading
   *  was found at index > 0. */
  elements: ContentElement[];
  /** Whether the next section's heading was found on the seam page at all. False means
   *  the next section holds the whole page, this section's tail included (#17 reports
   *  it as `next_page_unclaimed`). */
  headingFound: boolean;
}

export async function extractOrphanedStrip(
  doc: PDFDocumentProxy,
  seamPage: number,
  nextSectionNumber: string,
  hints?: HeadingHints,
): Promise<OrphanedStrip> {
  if (seamPage < 1 || seamPage > (doc.numPages || 0)) {
    return { elements: [], headingFound: false };
  }

  const elements = await extractPageContent(doc, seamPage, hints);
  const headingIdx = findSectionHeadingIndex(elements, nextSectionNumber);
  return {
    elements: headingIdx > 0 ? elements.slice(0, headingIdx) : [],
    headingFound: headingIdx !== -1,
  };
}

/**
 * A page's text, cut at section headings, for the search index (S-8).
 */
export interface PageSegment {
  /**
   * Section that owns this text, or null for text above the first heading — the strip,
   * which belongs to whichever section flows in from the previous page. The caller knows
   * that section; this module only knows where the cut is.
   */
  section: string | null;
  text: string;
}

/**
 * Split a page's text at the headings of the sections that start on it (S-8).
 *
 * The search index used to hand each whole page to the last section starting on or before
 * it, so the strip at the top of a page — the tail of the *previous* section — was always
 * misattributed to the next one: search_spec("QuadPoints") reported 12.5.6.11, but
 * QuadPoints is 12.5.6.10's Table 182, and get_tables("12.5.6.11") has no QuadPoints.
 * Search led straight to a section where the term cannot be found.
 *
 * Cutting here uses the same findSectionHeadingIndex as trimToSectionStart /
 * extractOrphanedStrip, so search attributes text to exactly the section whose
 * get_section shows it (the S-5 lesson: one rule, one place). The arms mirror it too:
 *   - heading found at index > 0 → text before it goes to the pending owner (the strip)
 *   - heading found at index 0   → no strip
 *   - heading not found          → the section keeps everything pending, and the previous
 *                                  owner adopts nothing (69 sections of ISO 32000-2)
 *
 * When NO heading is found at all, the page is returned as one raw-text segment for the
 * last starting section — exactly what the whole-page index did. Headingless pages cannot
 * be cut anyway, and the raw page does not depend on how well the struct tree was read.
 * Until #25 the walker dropped text placed directly under an unhandled role (TOC / TOCI /
 * Link / Span on the Contents pages, the errata "Issue #NNN" pages, the title page), so
 * element text on those pages was near-empty; it is read now, but Issue #379 (p.1020)
 * still yields no elements, so keep this arm.
 *
 * @param startingSections - section numbers starting on this page, in document order
 * @param hints - Outline-derived heading hints (see HeadingHints)
 */
export async function extractPageSegments(
  doc: PDFDocumentProxy,
  pageNum: number,
  startingSections: string[],
  hints?: HeadingHints,
): Promise<PageSegment[]> {
  const elements = await extractPageContent(doc, pageNum, hints);

  const segments: PageSegment[] = [];
  let owner: string | null = null;
  let start = 0;
  let anyHeadingFound = false;

  for (const sec of startingSections) {
    const idx = findSectionHeadingIndex(elements.slice(start), sec);
    if (idx === -1) {
      // Mirrors trimToSectionStart keeping the whole page when the heading is missing:
      // the section takes everything still pending (including any unemitted strip —
      // exactly what its get_section returns), and the previous owner adopts nothing.
      owner = sec;
      continue;
    }
    anyHeadingFound = true;
    const abs = start + idx;
    if (abs > start) {
      segments.push({ section: owner, text: elementsToText(elements.slice(start, abs)) });
    }
    owner = sec;
    start = abs;
  }

  if (!anyHeadingFound) {
    return [{ section: owner, text: await extractRawPageText(doc, pageNum) }].filter(
      (s) => s.text.trim().length > 0,
    );
  }

  segments.push({ section: owner, text: elementsToText(elements.slice(start)) });

  return segments.filter((s) => s.text.trim().length > 0);
}

/**
 * Raw page text, independent of tagging (see extractPageSegments' headingless arm).
 */
async function extractRawPageText(doc: PDFDocumentProxy, pageNum: number): Promise<string> {
  const page = await doc.getPage(pageNum);
  const textContent = await page.getTextContent();
  return textContent.items
    .filter((item): item is TextItem => 'str' in item)
    .map((item) => item.str)
    .join(' ');
}

/**
 * Flatten content elements to searchable text.
 */
function elementsToText(elements: ContentElement[]): string {
  const parts: string[] = [];
  for (const el of elements) {
    switch (el.type) {
      case 'heading':
      case 'paragraph':
      case 'code':
        parts.push(el.text);
        break;
      case 'note':
        parts.push(`${el.label} ${el.text}`);
        break;
      case 'list':
        parts.push(el.items.join('\n'));
        break;
      case 'table':
        parts.push([el.headers.join(' '), ...el.rows.map((r) => r.join(' '))].join('\n'));
        break;
    }
  }
  return parts.join('\n');
}

/**
 * Extract structured content from a single page
 */
async function extractPageContent(
  doc: PDFDocumentProxy,
  pageNum: number,
  hints?: HeadingHints,
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
  return walkStructTree(structTree, { textMap, hints });
}

/** What every struct-tree visitor needs: the page's text and the outline's heading hints. */
interface WalkContext {
  textMap: Map<string, string>;
  hints?: HeadingHints;
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
function walkStructTree(node: StructTreeNode, ctx: WalkContext): ContentElement[] {
  const elements: ContentElement[] = [];

  if (!node.children) return elements;

  for (const child of node.children) {
    if (isStructContent(child)) {
      // Leaf content node — will be collected by parent
      continue;
    }
    elements.push(...visitStructElement(child, ctx));
  }

  return elements;
}

/**
 * Content elements for one struct element (and, for containers, its subtree).
 */
function visitStructElement(child: StructTreeNode, ctx: WalkContext): ContentElement[] {
  const { textMap } = ctx;
  const role = child.role;

  // Skip artifacts (headers, footers, page numbers)
  if (role === 'Artifact') return [];

  // Heading elements (H1-H6, H)
  if (/^H[1-6]?$/.test(role)) {
    const text = collectText(child, textMap).trim();
    if (!text) return [];
    // role is /^H[1-6]?$/ (checked above), so role[1] is a single decimal digit.
    // Bare "H" (no level) defaults to 3.
    const level = role.length === 2 ? Number.parseInt(role[1], 10) : 3;
    return [{ type: 'heading', level, text } as HeadingElement];
  }

  // Paragraph
  if (role === 'P') {
    // A P that holds block elements is a container, not a paragraph (#15 / #16). The
    // Adobe-published ISO 32000-1 nests a whole page as Sect > P > P > …, with headings
    // as leaf Ps and tables as P > Span > Table. Collecting such a P's text flattens the
    // page into one element: headings stop being headings and tables melt into text
    // (get_tables("9.8.1") = 0 while Table 122's rows sit in a paragraph).
    if (hasBlockDescendant(child)) {
      return visitContainerParagraph(child, ctx);
    }
    return paragraphElements(collectText(child, textMap), ctx);
  }

  // List
  if (role === 'L') {
    const items = collectListItems(child, textMap);
    return items.length > 0 ? [{ type: 'list', items } as ListElement] : [];
  }

  // Table
  if (role === 'Table') {
    const out: ContentElement[] = [];
    // ISO 32000-1 puts the caption inside the Table (Table > Caption > P), ISO 32000-2
    // as the paragraph before it. table-collector reads the caption from the preceding
    // paragraph, so emit an in-table Caption there, as that paragraph.
    const caption = collectCaption(child, textMap);
    if (caption) out.push({ type: 'paragraph', text: caption } as ParagraphElement);
    const table = collectTable(child, textMap);
    if (table) out.push(table);
    return out;
  }

  // Code (Figure role with monospace content, or explicit Code role)
  if (role === 'Code') {
    const text = collectText(child, textMap).trim();
    return text ? [{ type: 'code', text }] : [];
  }

  // Any other role (Document, Part, Sect, Div, TOC, TOCI, Link, Span, Caption, Figure …):
  // read it like a container P. Block children become elements; text placed directly under
  // it, and the text of inline children, becomes paragraphs in document order. Walking only
  // the child elements dropped that text — the Contents section came back empty and the
  // errata tables lost their captions (#25). ISO 32000-2 §14.7.5.1 lets any structure
  // element hold content items directly; Figure's text is part of the figure (Table 373).
  return visitContainerParagraph(child, ctx);
}

/**
 * A container P (#15 / #16), and since #25 every role visitStructElement does not handle:
 * block children are visited as elements; the text between them — content leaves and
 * inline Span/Link children — is gathered into paragraphs. Without the gathering, a page's
 * first body paragraph, which ISO 32000-1 tags as a bare Span beside the block children,
 * would vanish. An element with only block children yields exactly what walking its
 * children did.
 */
function visitContainerParagraph(node: StructTreeNode, ctx: WalkContext): ContentElement[] {
  const out: ContentElement[] = [];
  const inline: string[] = [];
  const flush = () => {
    if (inline.length > 0) {
      out.push(...paragraphElements(inline.join(''), ctx));
      inline.length = 0;
    }
  };

  for (const child of node.children ?? []) {
    if (isStructContent(child)) {
      const text = ctx.textMap.get(child.id);
      if (text) inline.push(text);
      continue;
    }
    if (child.role === 'Artifact') continue;
    if (BLOCK_ROLES.has(child.role) || hasBlockDescendant(child)) {
      flush();
      out.push(...visitStructElement(child, ctx));
      continue;
    }
    inline.push(collectText(child, ctx.textMap));
  }
  flush();
  return out;
}

/**
 * Elements for paragraph text: a NOTE / EXAMPLE, a heading the outline knows (#15), or
 * a plain paragraph. Empty text yields nothing.
 */
function paragraphElements(raw: string, ctx: WalkContext): ContentElement[] {
  const text = raw.trim();
  if (!text) return [];

  // Detect NOTE/EXAMPLE
  const noteMatch = text.match(/^(NOTE\s*\d*|EXAMPLE\s*\d*)\s+/i);
  if (noteMatch) {
    return [
      {
        type: 'note',
        label: noteMatch[1],
        text: text.substring(noteMatch[0].length).trim(),
      } as NoteElement,
    ];
  }

  const heading = ctx.hints ? matchHeadingHint(text, ctx.hints) : null;
  if (heading) {
    return [{ type: 'heading', level: heading.level, text: heading.text } as HeadingElement];
  }

  return [{ type: 'paragraph', text } as ParagraphElement];
}

/** Roles that make their parent a container rather than a run of inline text. */
const BLOCK_ROLES: ReadonlySet<string> = new Set([
  'P',
  'H',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'L',
  'Table',
  'Code',
  'Sect',
  'Div',
  'Art',
  'Part',
  'BlockQuote',
]);

function hasBlockDescendant(node: StructTreeNode): boolean {
  for (const child of node.children ?? []) {
    if (isStructContent(child)) continue;
    if (BLOCK_ROLES.has(child.role) || hasBlockDescendant(child)) return true;
  }
  return false;
}

/** Text of a Table's Caption child, or null when it has none (or an empty one). */
function collectCaption(table: StructTreeNode, textMap: Map<string, string>): string | null {
  for (const child of table.children ?? []) {
    if (!isStructContent(child) && child.role === 'Caption') {
      const text = collectText(child, textMap).trim();
      return text || null;
    }
  }
  return null;
}

const HEADING_HINT_MAX_LENGTH = 200;

/**
 * Whether paragraph text is the heading of a section the outline lists (#15).
 *
 * The text must reproduce the outline entry — key and title — not merely begin with a
 * number: "9.8, "Font Descriptors"" in a sentence must not become a heading. Matching
 * ignores case, whitespace (headings wrap: "Annex A\n(informative)\nOperator Summary")
 * and the (normative) / (informative) marker the outline title drops.
 *
 * Annex subsections have no number in the outline, so their key is the whole title
 * ("C.1 General") and the text must equal it.
 *
 * The returned `text` is what the heading element carries: it starts with the key
 * followed by a boundary, which is exactly what findSectionHeadingIndex looks for.
 */
function matchHeadingHint(
  text: string,
  hints: HeadingHints,
): { key: string; level: number; text: string } | null {
  if (text.length > HEADING_HINT_MAX_LENGTH) return null;

  const numbered = text.match(/^(\d+(?:\.\d+)*|Annex\s+[A-Z])(?=\s)/);
  if (numbered) {
    const key = numbered[1].replace(/\s+/g, ' ');
    const title = hints.get(key);
    if (title !== undefined && normalizeHeading(text) === normalizeHeading(`${key} ${title}`)) {
      const level = key.startsWith('Annex') ? 1 : key.split('.').length;
      return { key, level, text: `${key}${text.slice(numbered[1].length)}` };
    }
    return null;
  }

  const titleKey = text.replace(/\s+/g, ' ');
  if (hints.has(titleKey)) {
    return { key: titleKey, level: 2, text: titleKey };
  }
  return null;
}

function normalizeHeading(s: string): string {
  return s
    .replace(/\((?:normative|informative)\)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
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
