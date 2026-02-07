/**
 * Requirement Extractor
 * Extracts normative requirements (shall/should/may) from ContentElement arrays.
 * Operates at the semantic level on already-extracted content.
 */

import type { ContentElement, Requirement, ISORequirementLevel } from '../types/index.js';

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

/**
 * Extract requirements from a single text string.
 */
function extractFromText(
  text: string,
  sectionNumber: string,
  sectionTitle: string,
  idCounter: { value: number }
): Requirement[] {
  const requirements: Requirement[] = [];
  const regex = createISORequirementRegex();
  const seen = new Set<string>(); // deduplicate by sentence text

  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
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
    });
  }

  return requirements;
}

/**
 * Extract all normative requirements from ContentElement[].
 * Scans paragraphs, list items, and notes for ISO keywords.
 */
export function extractRequirementsFromContent(
  content: ContentElement[],
  sectionNumber: string,
  sectionTitle: string
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

  return requirements;
}
