/**
 * PDF Loader Service
 * Wraps pdfjs-dist for PDF loading, outline resolution, and page access.
 *
 * Multi-document LRU cache:
 *   - Up to MAX_CACHED_DOCS PDFDocumentProxy instances are kept in memory.
 *   - Least-recently-used documents are evicted via doc.destroy() to free memory.
 */

import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readFile } from 'fs/promises';
import { MAX_CACHED_DOCS } from '../config.js';
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

// ========================================
// Multi-document LRU cache
// ========================================

const documentCache = new Map<string, PDFDocumentProxy>();
const accessOrder: string[] = []; // LRU tracking: oldest first

/**
 * Load PDF document (LRU cached, up to MAX_CACHED_DOCS)
 */
export async function loadDocument(pdfPath: string): Promise<PDFDocumentProxy> {
  const existing = documentCache.get(pdfPath);
  if (existing) {
    // Move to end of access order (most recently used)
    const idx = accessOrder.indexOf(pdfPath);
    if (idx >= 0) accessOrder.splice(idx, 1);
    accessOrder.push(pdfPath);
    return existing;
  }

  return loadDocumentFresh(pdfPath);
}

/**
 * Force-reload a PDF document, bypassing the LRU cache.
 *
 * Required before full-page iteration (e.g., building a search index) because
 * pdfjs-dist v5 uses a global singleton `PagesMapper` with static state.
 * `PagesMapper.#pagesNumber` is set to the page count of the LAST document
 * loaded via `getDocument()`, so any previously cached document whose page
 * count differs from the current `PagesMapper.#pagesNumber` will reject
 * `getPage()` calls for pages beyond that number with "Invalid page request."
 *
 * By reloading the document, `getDocument()` resets `PagesMapper.#pagesNumber`
 * to the correct value for this document.
 */
export async function reloadDocument(pdfPath: string): Promise<PDFDocumentProxy> {
  // Evict from cache if present
  const existing = documentCache.get(pdfPath);
  if (existing) {
    existing.destroy();
    documentCache.delete(pdfPath);
    const idx = accessOrder.indexOf(pdfPath);
    if (idx >= 0) accessOrder.splice(idx, 1);
  }

  return loadDocumentFresh(pdfPath);
}

/**
 * Internal: Load a fresh document from disk and add to LRU cache.
 */
async function loadDocumentFresh(pdfPath: string): Promise<PDFDocumentProxy> {
  // Evict oldest if cache is full
  while (documentCache.size >= MAX_CACHED_DOCS && accessOrder.length > 0) {
    const oldest = accessOrder.shift()!;
    const doc = documentCache.get(oldest);
    if (doc) {
      doc.destroy();
      documentCache.delete(oldest);
      logger.debug('PDFLoader', `Evicted cached document: ${oldest}`);
    }
  }

  // Load new document
  const start = Date.now();
  const data = new Uint8Array(await readFile(pdfPath));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc: PDFDocumentProxy = await (pdfjsLib as any).getDocument({ data }).promise;
  const elapsed = Date.now() - start;

  logger.info('PDFLoader', `Loaded ${pdfPath} (${doc.numPages} pages) in ${elapsed}ms`);

  documentCache.set(pdfPath, doc);
  accessOrder.push(pdfPath);
  return doc;
}

// ========================================
// Outline resolution
// ========================================

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
  nodes: OutlineNode[]
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
  dest: string | unknown[] | null
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

// ========================================
// Section number parsing
// ========================================

/**
 * Parse section number from outline title.
 *
 * Handles multiple PDF spec formats:
 *   - Standard numeric: "7.3.4 String objects" → "7.3.4"
 *   - Dot-terminated:   "1. Introduction"     → "1"   (WTPDF format)
 *   - Annex:            "Annex A (normative)"  → "Annex A"
 *   - Annex subsection: "Annex A.1 ..."        → "Annex A.1"
 *   - Appendix:         "Appendix A: ..."      → "Appendix A"
 *   - Zero-width spaces stripped before matching
 */
export function parseSectionNumber(title: string): string | null {
  // Strip zero-width spaces and normalize whitespace
  const cleaned = title.replace(/[\u200B-\u200F\uFEFF]/g, '').trim();

  // Numeric section: "7", "7.3", "7.3.4.1" followed by whitespace
  const numMatch = cleaned.match(/^(\d+(?:\.\d+)*)\s+/);
  if (numMatch) return numMatch[1];

  // Dot-terminated numeric: "1. Introduction" (WTPDF format)
  // Must be followed by a space and an uppercase letter to distinguish from "7.3.4"
  const dotMatch = cleaned.match(/^(\d+)\.\s+[A-Z]/);
  if (dotMatch) return dotMatch[1];

  // Annex: "Annex A", "Annex A.1", "Annex A (normative) ..."
  const annexMatch = cleaned.match(/^(Annex\s+[A-Z](?:\.\d+)*)/i);
  if (annexMatch) return annexMatch[1];

  // Appendix: "Appendix A: ..." (WTPDF/PDF Association format)
  const appendixMatch = cleaned.match(/^(Appendix\s+[A-Z])/i);
  if (appendixMatch) return appendixMatch[1].replace(/appendix/i, 'Appendix');

  return null;
}
