/**
 * Requirement Extractor
 * Extracts normative requirements (shall/should/may) from ContentElement arrays.
 * Operates at the semantic level on already-extracted content.
 */

import type { ContentElement, ISORequirementLevel, Requirement } from '../types/index.js';
import { collectStructTreeTables } from './table-collector.js';

/**
 * ISO requirement keywords ordered longest-first for greedy regex matching.
 */
const ISO_REQUIREMENT_KEYWORDS: ISORequirementLevel[] = [
  'shall not',
  'should not',
  'shall',
  'should',
  'may',
];

/**
 * Create a regex that matches ISO normative keywords (case-insensitive).
 * Returns a new RegExp instance each time (stateful due to /g flag).
 */
function createISORequirementRegex(): RegExp {
  return new RegExp(`\\b(${ISO_REQUIREMENT_KEYWORDS.join('|')})\\b`, 'gi');
}

/**
 * Extract the full sentence containing the keyword at the given position.
 * Sentence boundaries: period/exclamation/question followed by whitespace, or start/end of text.
 * Avoids splitting on decimal numbers (e.g., "3.14") and common abbreviations.
 */
export function extractSentence(text: string, position: number): string {
  // Find sentence start: scan backwards
  let start = position;
  while (start > 0) {
    const ch = text[start - 1];
    if (ch === '.' || ch === '!' || ch === '?') {
      // Check it's followed by whitespace (real sentence boundary)
      if (start < text.length && /\s/.test(text[start])) {
        // Skip decimal numbers like "3.14" or section references like "7.3.4"
        if (start >= 2 && /\d/.test(text[start - 2])) {
          start--;
          continue;
        }
        break;
      }
    }
    start--;
  }

  // Find sentence end: scan forward
  let end = position;
  while (end < text.length) {
    const ch = text[end];
    if (ch === '.' || ch === '!' || ch === '?') {
      if (end + 1 >= text.length || /\s/.test(text[end + 1])) {
        // Skip decimal numbers
        if (
          end > 0 &&
          /\d/.test(text[end - 1]) &&
          end + 1 < text.length &&
          /\d/.test(text[end + 1])
        ) {
          end++;
          continue;
        }
        end++; // include the period
        break;
      }
    }
    end++;
  }

  return text.substring(start, end).trim();
}

/** Where a sentence came from, carried onto every requirement found in it. */
type RequirementContext = Pick<Requirement, 'source' | 'table' | 'key'>;

/**
 * Extract requirements from a single text string.
 */
function extractFromText(
  text: string,
  sectionNumber: string,
  sectionTitle: string,
  idCounter: { value: number },
  context?: RequirementContext,
): Requirement[] {
  const requirements: Requirement[] = [];
  const regex = createISORequirementRegex();
  const seen = new Set<string>(); // deduplicate by sentence text

  // regex is global (see createISORequirementRegex), so matchAll walks every hit.
  for (const match of text.matchAll(regex)) {
    const level = match[1].toLowerCase() as ISORequirementLevel;
    const sentence = extractSentence(text, match.index);

    // Deduplicate: same sentence may be matched multiple times
    const dedupeKey = `${level}:${sentence}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    requirements.push({
      id: `R-${sectionNumber}-${idCounter.value++}`,
      level,
      text: sentence,
      section: sectionNumber,
      sectionTitle,
      ...context,
    });
  }

  return requirements;
}

/**
 * Extract all normative requirements from ContentElement[].
 * Scans paragraphs, list items, notes, and table cells for ISO keywords.
 */
export function extractRequirementsFromContent(
  content: ContentElement[],
  sectionNumber: string,
  sectionTitle: string,
): Requirement[] {
  const requirements: Requirement[] = [];
  const idCounter = { value: 1 };

  for (const element of content) {
    switch (element.type) {
      case 'paragraph':
        requirements.push(...extractFromText(element.text, sectionNumber, sectionTitle, idCounter));
        break;
      case 'list':
        for (const item of element.items) {
          requirements.push(...extractFromText(item, sectionNumber, sectionTitle, idCounter));
        }
        break;
      case 'note':
        requirements.push(...extractFromText(element.text, sectionNumber, sectionTitle, idCounter));
        break;
    }
  }

  requirements.push(...extractFromTables(content, sectionNumber, sectionTitle, idCounter));

  return requirements;
}

/**
 * Requirements stated inside tables.
 *
 * ISO puts a great deal of normative text in table cells — "(Required) The type of
 * annotation ... shall be Highlight, Underline, ..." — and scanning only prose misses all
 * of it: 1540 cells across 333 sections of ISO 32000-2, roughly 3000 keyword occurrences.
 *
 * Tables are re-assembled with collectStructTreeTables rather than read element by element,
 * so that a caption is attributed the same way get_tables attributes it, and a table split
 * across pages yields one set of requirements rather than several headless fragments.
 *
 * Only StructTree tables are considered. Text-detected tables (detectTablesFromText) are
 * made of `paragraph` elements that the prose loop above already scanned; taking those too
 * would count every sentence twice.
 */
function extractFromTables(
  content: ContentElement[],
  sectionNumber: string,
  sectionTitle: string,
  idCounter: { value: number },
): Requirement[] {
  const requirements: Requirement[] = [];

  for (const table of collectStructTreeTables(content)) {
    for (const row of table.rows) {
      // Row label ("Subtype", "Length", the bit number ...). Without it a lifted sentence
      // cannot be traced back to what it constrains.
      const key = row[0];
      for (const cell of row) {
        requirements.push(
          ...extractFromText(cell, sectionNumber, sectionTitle, idCounter, {
            source: 'table',
            ...(table.caption ? { table: table.caption } : {}),
            ...(key ? { key } : {}),
          }),
        );
      }
    }
  }

  return requirements;
}
