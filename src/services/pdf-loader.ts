/**
 * PDF Loader Service
 * Wraps pdfjs-dist for PDF loading, outline resolution, and page access
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readFile } from 'fs/promises';
import { logger } from '../utils/logger.js';
import type { OutlineEntry } from '../types/index.js';

// Use pdfjs-dist types directly
export type {
  PDFDocumentProxy,
  PDFPageProxy,
  TextContent,
  TextItem,
  TextMarkedContent,
  StructTreeNode,
  StructTreeContent,
} from 'pdfjs-dist/types/src/display/api.js';

import type { PDFDocumentProxy, RefProxy } from 'pdfjs-dist/types/src/display/api.js';

// pdfjs-dist outline type (not exported from types)
interface OutlineNode {
  title: string;
  dest: string | unknown[] | null;
  items: OutlineNode[];
}

// Document cache (PDF loading is expensive)
let cachedDoc: PDFDocumentProxy | null = null;
let cachedPath: string | null = null;

/**
 * Load PDF document (cached)
 */
export async function loadDocument(pdfPath: string): Promise<PDFDocumentProxy> {
  if (cachedDoc && cachedPath === pdfPath) {
    return cachedDoc;
  }

  const start = Date.now();
  const data = new Uint8Array(await readFile(pdfPath));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc: PDFDocumentProxy = await (pdfjsLib as any).getDocument({ data }).promise;
  const elapsed = Date.now() - start;

  logger.info('PDFLoader', `Loaded ${pdfPath} (${doc.numPages} pages) in ${elapsed}ms`);

  cachedDoc = doc;
  cachedPath = pdfPath;
  return doc;
}

/**
 * Get outline with resolved page numbers
 */
export async function getOutlineWithPages(doc: PDFDocumentProxy): Promise<OutlineEntry[]> {
  const rawOutline = await doc.getOutline();
  if (!rawOutline) return [];
  return resolveOutlineNodes(doc, rawOutline);
}

async function resolveOutlineNodes(
  doc: PDFDocumentProxy,
  nodes: OutlineNode[],
): Promise<OutlineEntry[]> {
  const entries: OutlineEntry[] = [];

  for (const node of nodes) {
    const page = await resolveDestToPage(doc, node.dest);
    const sectionNumber = parseSectionNumber(node.title);
    const children = node.items ? await resolveOutlineNodes(doc, node.items) : [];

    entries.push({
      title: node.title,
      page,
      sectionNumber,
      children,
    });
  }

  return entries;
}

async function resolveDestToPage(
  doc: PDFDocumentProxy,
  dest: string | unknown[] | null,
): Promise<number> {
  if (!dest) return -1;

  try {
    let destArray: unknown[];
    if (typeof dest === 'string') {
      const resolved = await doc.getDestination(dest);
      if (!resolved) return -1;
      destArray = resolved;
    } else {
      destArray = dest;
    }

    const pageIndex = await doc.getPageIndex(destArray[0] as RefProxy);
    return pageIndex + 1; // 1-based
  } catch {
    return -1;
  }
}

/**
 * Parse section number from outline title
 * e.g., "7.3.4 String objects" -> "7.3.4"
 * e.g., "Annex A (normative) Operator summary" -> "Annex A"
 */
function parseSectionNumber(title: string): string | null {
  // Numeric section: "7", "7.3", "7.3.4.1"
  const numMatch = title.match(/^(\d+(?:\.\d+)*)\s+/);
  if (numMatch) return numMatch[1];

  // Annex: "Annex A", "Annex A.1"
  const annexMatch = title.match(/^(Annex\s+[A-Z](?:\.\d+)*)/i);
  if (annexMatch) return annexMatch[1];

  return null;
}
