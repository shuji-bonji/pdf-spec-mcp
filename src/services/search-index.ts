/**
 * Search Index
 * Full-text search over PDF specification pages
 */

import type { SectionIndex, PageText, TextIndex, SearchHit } from '../types/index.js';
import type { PDFDocumentProxy, TextItem } from './pdf-loader.js';
import { logger } from '../utils/logger.js';

/**
 * Build full-text search index from all PDF pages
 */
export async function buildSearchIndex(
  doc: PDFDocumentProxy,
  sectionIndex: SectionIndex,
): Promise<TextIndex> {
  const start = Date.now();
  const pages: PageText[] = [];
  const totalPages = doc.numPages;

  logger.info('SearchIndex', `Building search index for ${totalPages} pages...`);

  for (let i = 1; i <= totalPages; i++) {
    const page = await doc.getPage(i);
    const textContent = await page.getTextContent();
    const text = textContent.items
      .filter((item): item is TextItem => 'str' in item)
      .map((item) => item.str)
      .join(' ');

    const section = findSectionForPage(sectionIndex, i);
    pages.push({
      page: i,
      section: section?.sectionNumber || '',
      text,
    });

    // Log progress every 100 pages
    if (i % 100 === 0) {
      logger.debug('SearchIndex', `Indexed ${i}/${totalPages} pages`);
    }
  }

  const buildTime = Date.now() - start;
  logger.info('SearchIndex', `Search index built in ${buildTime}ms (${totalPages} pages)`);

  return { pages, buildTime };
}

/**
 * Search the index for a query string
 */
export function searchTextIndex(
  index: TextIndex,
  query: string,
  maxResults: number,
  sectionIndex: SectionIndex,
): SearchHit[] {
  const normalizedQuery = query.toLowerCase();
  const hits: SearchHit[] = [];

  for (const pageText of index.pages) {
    const lowerText = pageText.text.toLowerCase();
    const idx = lowerText.indexOf(normalizedQuery);
    if (idx === -1) continue;

    // Count occurrences for scoring
    let count = 0;
    let searchIdx = 0;
    while ((searchIdx = lowerText.indexOf(normalizedQuery, searchIdx)) !== -1) {
      count++;
      searchIdx += normalizedQuery.length;
    }

    // Generate snippet
    const snippetStart = Math.max(0, idx - 75);
    const snippetEnd = Math.min(pageText.text.length, idx + query.length + 75);
    const snippet =
      (snippetStart > 0 ? '...' : '') +
      pageText.text.substring(snippetStart, snippetEnd) +
      (snippetEnd < pageText.text.length ? '...' : '');

    // Resolve section title
    const sectionInfo = pageText.section
      ? sectionIndex.sections.get(pageText.section)
      : undefined;

    hits.push({
      section: pageText.section,
      title: sectionInfo?.title || '',
      page: pageText.page,
      snippet: snippet.trim(),
      score: count,
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
 * Find which section a page belongs to
 */
function findSectionForPage(
  sectionIndex: SectionIndex,
  page: number,
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
