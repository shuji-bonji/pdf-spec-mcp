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
import type { ContentElement, TableElement, TableInfo } from '../types/index.js';

/**
 * Collect tables from StructTree-extracted content (type: 'table').
 *
 * Note this deliberately ignores text-detected tables (see detectTablesFromText): those are
 * built out of `paragraph` elements, which prose scanners already read. Requirements must
 * come from here only, or the same sentence would be counted twice.
 */
export function collectStructTreeTables(content: ContentElement[]): TableInfo[] {
  const tables: TableInfo[] = [];
  // Content index of the last `table` element folded into `tables`, so the headerless
  // rule below can demand adjacency. A page break splits one table into consecutive
  // `table` elements; an intervening paragraph means the next table is a different one
  // (8.7.4.5.5: the Mesh 2 flag list must not be merged into Mesh 1's).
  let lastTableElementIndex = -1;

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

    if (!caption && tables.length > 0) {
      const last = tables[tables.length - 1];

      // Continuation, form 1: the header row is repeated (ISO restates it when a table
      // resumes on a new page). Matching headers identify the fragment regardless of
      // whatever lies between (the repeated header row itself is dropped).
      if (element.headers.length > 0 && arraysEqual(last.headers, element.headers)) {
        last.rows.push(...element.rows.map((row) => [...row]));
        lastTableElementIndex = i;
        continue;
      }

      // Continuation, form 2 (S-4): the fragment carries no usable header — either none
      // at all, or one whose cells are all blank (image-only rows extract as ""). Headers
      // cannot identify it, so instead require that it directly follows the previous
      // fragment and has the same column count. A blank header row is dropped like a
      // repeated one: whether it was a restated header or an image-only row, it holds no
      // text either way.
      if (
        i === lastTableElementIndex + 1 &&
        isEffectivelyHeaderless(element) &&
        columnCountOf(element.headers, element.rows) === columnCountOf(last.headers, last.rows)
      ) {
        last.rows.push(...element.rows.map((row) => [...row]));
        lastTableElementIndex = i;
        continue;
      }
    }

    tables.push({
      index: tables.length,
      caption,
      // Copy, never alias — and copy continuation rows too (above). `content` is the
      // section content cache: handing out a reference to `element.rows` and then pushing
      // into it rewrites the cached page itself, so every later call sees a table that
      // has grown. get_tables followed by get_requirements returned 4 table requirements,
      // then 7, then 10 — the tool is declared idempotent and read-only, and this made it
      // neither. Inner row arrays alias the cache just the same: a caller editing a cell
      // of the result must not reach the cached page.
      headers: [...element.headers],
      rows: element.rows.map((row) => [...row]),
    });
    lastTableElementIndex = i;
  }

  return tables;
}

/**
 * A table fragment that headers cannot identify: none at all, or all cells blank.
 * (Image-only header rows extract as empty strings — 8.4.3.4 / 10.6.3.)
 */
function isEffectivelyHeaderless(element: TableElement): boolean {
  return element.headers.length === 0 || element.headers.every((h) => h.trim() === '');
}

/**
 * Column count of a table or fragment: header width when there is a header row,
 * otherwise the width of the first data row.
 */
function columnCountOf(headers: string[], rows: string[][]): number {
  if (headers.length > 0) return headers.length;
  return rows[0]?.length ?? 0;
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
