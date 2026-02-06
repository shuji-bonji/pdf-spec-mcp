/**
 * Outline Resolver
 * Builds section index from PDF outline tree
 */

import type { OutlineEntry, SectionInfo, SectionIndex } from '../types/index.js';

/**
 * Build a section index from outline entries
 * Creates both a flat lookup map and preserves the tree structure
 */
export function buildSectionIndex(outline: OutlineEntry[], totalPages: number): SectionIndex {
  const sections = new Map<string, SectionInfo>();
  const flatOrder: SectionInfo[] = [];

  // Flatten in DFS order
  function flatten(entries: OutlineEntry[], depth: number, parent: string | null): void {
    for (const entry of entries) {
      const key = entry.sectionNumber || entry.title;
      if (entry.page < 1) continue; // skip unresolvable entries

      const info: SectionInfo = {
        sectionNumber: key,
        title: extractTitle(entry.title, entry.sectionNumber),
        page: entry.page,
        endPage: -1, // calculated below
        depth,
        parent,
        children: entry.children
          .filter((c) => c.page >= 1)
          .map((c) => c.sectionNumber || c.title),
      };

      sections.set(key, info);
      // Also register lowercase key for case-insensitive lookup
      const lowerKey = key.toLowerCase();
      if (lowerKey !== key && !sections.has(lowerKey)) {
        sections.set(lowerKey, info);
      }
      flatOrder.push(info);

      flatten(entry.children, depth + 1, key);
    }
  }

  flatten(outline, 0, null);

  // Calculate endPage: next entry's page - 1
  for (let i = 0; i < flatOrder.length; i++) {
    if (i + 1 < flatOrder.length) {
      flatOrder[i].endPage = Math.max(flatOrder[i].page, flatOrder[i + 1].page - 1);
    } else {
      flatOrder[i].endPage = totalPages;
    }
  }

  return { tree: outline, sections, flatOrder, totalPages };
}

/**
 * Extract the title text after the section number
 * e.g., "7.3.4 String objects" -> "String objects"
 */
function extractTitle(fullTitle: string, sectionNumber: string | null): string {
  if (!sectionNumber) return fullTitle;

  // Remove section number prefix
  const numPattern = fullTitle.match(/^(?:\d+(?:\.\d+)*|Annex\s+[A-Z](?:\.\d+)*)\s+/i);
  if (numPattern) {
    let title = fullTitle.substring(numPattern[0].length);
    // Remove normative/informative annotation from Annex titles
    title = title.replace(/^\((?:normative|informative)\)\s*/i, '');
    return title;
  }
  return fullTitle;
}

/**
 * Find a section by flexible matching
 */
export function findSection(
  index: SectionIndex,
  query: string,
): SectionInfo | undefined {
  // Exact match
  const exact = index.sections.get(query);
  if (exact) return exact;

  // Case-insensitive match
  const lower = index.sections.get(query.toLowerCase());
  if (lower) return lower;

  // Partial match: try "Annex X" for just "X"
  if (/^[A-Z]$/i.test(query)) {
    const annex = index.sections.get(`Annex ${query.toUpperCase()}`);
    if (annex) return annex;
  }

  return undefined;
}
