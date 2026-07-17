/**
 * Table Collector
 * Turns StructTree-extracted content into logical tables.
 *
 * Shared so that get_tables and get_requirements agree on what a table *is* — its caption
 * and where it ends. A table split across pages arrives as several `table` elements; only
 * this module knows how to put them back together, and its rules (caption detection,
 * continuation merging) must not be restated elsewhere.
 */

import { TABLE_CAPTION_START_RE } from '../config.js';
import type { ContentElement, TableInfo } from '../types/index.js';

/**
 * Collect tables from StructTree-extracted content (type: 'table').
 *
 * Note this deliberately ignores text-detected tables (see detectTablesFromText): those are
 * built out of `paragraph` elements, which prose scanners already read. Requirements must
 * come from here only, or the same sentence would be counted twice.
 */
export function collectStructTreeTables(content: ContentElement[]): TableInfo[] {
  const tables: TableInfo[] = [];

  for (let i = 0; i < content.length; i++) {
    const element = content[i];
    if (element.type !== 'table') continue;

    // Check for caption in preceding paragraph
    let caption: string | null = null;
    if (i > 0) {
      const prev = content[i - 1];
      if (prev.type === 'paragraph' && TABLE_CAPTION_START_RE.test(prev.text)) {
        caption = prev.text;
      }
    }

    // Merge with previous table if this is a continuation (same headers, no caption).
    // Headerless tables cannot be matched this way and so stay split — see S-4.
    if (
      !caption &&
      tables.length > 0 &&
      element.headers.length > 0 &&
      arraysEqual(tables[tables.length - 1].headers, element.headers)
    ) {
      tables[tables.length - 1].rows.push(...element.rows);
      continue;
    }

    tables.push({
      index: tables.length,
      caption,
      headers: element.headers,
      rows: element.rows,
    });
  }

  return tables;
}

/**
 * Check if two string arrays are equal
 */
function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
