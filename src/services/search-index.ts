/**
 * Search Index
 * Full-text search over PDF specification pages
 */

import type { SectionIndex, PageText, TextIndex, SearchHit } from '../types/index.js';
import type { PDFDocumentProxy, TextItem } from './pdf-loader.js';
import { CONCURRENCY } from '../config.js';
import { mapConcurrent } from '../utils/concurrency.js';
import { logger } from '../utils/logger.js';

/**
 * Build full-text search index from all PDF pages.
 * Uses chunked parallel processing for improved performance.
 */
export async function buildSearchIndex(
  doc: PDFDocumentProxy,
  sectionIndex: SectionIndex
): Promise<TextIndex> {
  const start = Date.now();
  const totalPages = doc.numPages;

  logger.info(
    'SearchIndex',
    `Building search index for ${totalPages} pages (concurrency: ${CONCURRENCY.searchIndex})...`
  );

  const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1);

  const pages: PageText[] = await mapConcurrent(
    pageNumbers,
    async (pageNum) => {
      const page = await doc.getPage(pageNum);
      const textContent = await page.getTextContent();
      const text = textContent.items
        .filter((item): item is TextItem => 'str' in item)
        .map((item) => item.str)
        .join(' ');

      const section = findSectionForPage(sectionIndex, pageNum);
      return {
        page: pageNum,
        section: section?.sectionNumber || '',
        text,
      };
    },
    CONCURRENCY.searchIndex
  );

  const buildTime = Date.now() - start;
  logger.info('SearchIndex', `Search index built in ${buildTime}ms (${totalPages} pages)`);

  return { pages, buildTime };
}

/**
 * Normalize text for search: collapse spaces around hyphens, normalize whitespace
 * Handles PDF text extraction artifacts like "cross- reference" or "cross -reference"
 */
function normalizeForSearch(text: string): string {
  return text
    .replace(/\s*-\s*/g, '-') // collapse spaces around hyphens
    .replace(/\s+/g, ' '); // normalize whitespace
}

/**
 * Search the index for a query string
 * Supports multi-word AND queries (all words must be present)
 */
export function searchTextIndex(
  index: TextIndex,
  query: string,
  maxResults: number,
  sectionIndex: SectionIndex
): SearchHit[] {
  const normalizedQuery = normalizeForSearch(query.toLowerCase());
  const queryWords = normalizedQuery.split(/\s+/).filter((w) => w.length > 0);
  const hits: SearchHit[] = [];

  for (const pageText of index.pages) {
    const normalizedText = normalizeForSearch(pageText.text.toLowerCase());

    // Try exact phrase match first
    let idx = normalizedText.indexOf(normalizedQuery);
    let score = 0;

    if (idx !== -1) {
      // Count exact phrase occurrences
      let searchIdx = 0;
      while ((searchIdx = normalizedText.indexOf(normalizedQuery, searchIdx)) !== -1) {
        score += 3; // exact phrase match scores higher than AND
        searchIdx += normalizedQuery.length;
      }
    } else if (queryWords.length > 1) {
      // Fallback: AND search — all words must be present
      const allPresent = queryWords.every((word) => normalizedText.includes(word));
      if (!allPresent) continue;

      // Score = sum of individual word occurrences
      for (const word of queryWords) {
        let searchIdx = 0;
        while ((searchIdx = normalizedText.indexOf(word, searchIdx)) !== -1) {
          score++;
          searchIdx += word.length;
        }
      }

      // Find best snippet position (first occurrence of any query word)
      idx = Math.min(...queryWords.map((w) => normalizedText.indexOf(w)).filter((i) => i !== -1));
    } else {
      continue;
    }

    // Generate snippet from original text (find approximate position)
    const snippetIdx = findOriginalPosition(pageText.text, idx, normalizedText);
    const snippetStart = Math.max(0, snippetIdx - 75);
    const snippetEnd = Math.min(pageText.text.length, snippetIdx + query.length + 75);
    const snippet =
      (snippetStart > 0 ? '...' : '') +
      pageText.text.substring(snippetStart, snippetEnd) +
      (snippetEnd < pageText.text.length ? '...' : '');

    // Resolve section title
    const sectionInfo = pageText.section ? sectionIndex.sections.get(pageText.section) : undefined;

    hits.push({
      section: pageText.section,
      title: sectionInfo?.title || '',
      page: pageText.page,
      snippet: snippet.trim(),
      score,
    });
  }

  // Sort by score descending
  hits.sort((a, b) => b.score - a.score);

  // Deduplicate by section, return top results
  const sectionSeen = new Set<string>();
  const deduped: SearchHit[] = [];
  for (const hit of hits) {
    const key = hit.section || `page:${hit.page}`;
    if (sectionSeen.has(key)) continue;
    sectionSeen.add(key);
    deduped.push(hit);
    if (deduped.length >= maxResults) break;
  }

  return deduped;
}

/**
 * Map a position in normalized text back to approximate position in original text
 */
function findOriginalPosition(
  original: string,
  normalizedIdx: number,
  _normalized: string
): number {
  // Simple heuristic: the position ratio is roughly preserved
  if (normalizedIdx <= 0) return 0;
  const ratio = normalizedIdx / _normalized.length;
  return Math.min(Math.floor(ratio * original.length), original.length - 1);
}

/**
 * Find which section a page belongs to
 */
function findSectionForPage(
  sectionIndex: SectionIndex,
  page: number
): { sectionNumber: string } | undefined {
  // Binary search on flatOrder (sorted by page)
  const flat = sectionIndex.flatOrder;
  let result: { sectionNumber: string } | undefined;

  for (const info of flat) {
    if (info.page <= page) {
      result = { sectionNumber: info.sectionNumber };
    } else {
      break;
    }
  }

  return result;
}
