/**
 * Definition Extractor
 * Extracts term definitions from the "Terms and definitions" clause of a PDF specification.
 *
 * That clause has NO subsections in the PDF outline — all definitions (71 in ISO 32000-2,
 * 46 in ISO 32000-1) appear as flat paragraph sequences within a single section.
 * This extractor parses the content heuristically by detecting term boundaries.
 *
 * Which clause it is depends on the document (#18): clause 3 in ISO 32000-2, but clause 4
 * in ISO 32000-1, whose clause 3 is "Normative references". Reading clause 3 of ISO 32000-1
 * finds no "3.n" marker and reports 0 definitions without error.
 */

import type { ContentElement, Definition, SectionResult } from '../types/index.js';

/** Default clause, for callers that know they are reading ISO 32000-2. */
export const DEFAULT_DEFINITIONS_CLAUSE = '3';

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Detect if a ContentElement is a section number marker (e.g., paragraph "3.1").
 * Returns the section number string or null.
 */
function detectSectionNumberMarker(el: ContentElement, clause: string): string | null {
  const c = escapeRegExp(clause);
  if (el.type === 'paragraph') {
    const match = el.text.trim().match(new RegExp(`^(${c}\\.\\d+)$`));
    if (match) return match[1];
  }
  if (el.type === 'heading') {
    const match = el.text.trim().match(new RegExp(`^(${c}\\.\\d+)\\s`));
    if (match) return match[1];
  }
  return null;
}

/**
 * Check if a paragraph looks like a term name (short, no sentence-ending punctuation).
 */
function isLikelyTerm(text: string): boolean {
  const t = text.trim();
  return (
    t.length > 0 &&
    t.length < 80 &&
    !t.endsWith('.') &&
    !t.endsWith(':') &&
    !t.endsWith(')') &&
    !t.startsWith('NOTE') &&
    !t.startsWith('EXAMPLE') &&
    !t.startsWith('[') &&
    !t.startsWith('For the purposes') &&
    !t.startsWith('ISO ') &&
    !/^\d+(\.\d+)*$/.test(t) // Not just a number
  );
}

/**
 * Check if a list element only contains section number labels (e.g., "3.1\n3.2\n...").
 */
function isNumberList(el: ContentElement, clause: string): boolean {
  if (el.type !== 'list') return false;
  const re = new RegExp(`^${escapeRegExp(clause)}\\.\\d+$`);
  return el.items.every((item) => {
    // Each item may have multiple numbers separated by newlines
    const parts = item
      .split(/\n/)
      .map((p) => p.trim())
      .filter(Boolean);
    return parts.every((p) => re.test(p));
  });
}

/**
 * Parse the definitions clause's content to extract definitions.
 *
 * The content has no structural subsections; definitions appear as:
 *   [optional section number paragraph "3.X"]
 *   [term paragraph - short, no period]
 *   [definition paragraph(s) - longer, with periods]
 *   [optional notes]
 *   ... repeat ...
 *
 * @param clause - the clause number the markers carry ("3" for ISO 32000-2, "4" for ISO 32000-1)
 */
export function parseSection3Content(
  content: ContentElement[],
  clause: string = DEFAULT_DEFINITIONS_CLAUSE,
): Definition[] {
  const definitions: Definition[] = [];
  const clauseHeading = new RegExp(`^${escapeRegExp(clause)} `);
  const markerPrefix = new RegExp(`^${escapeRegExp(clause)}\\.\\d+\\s+`);
  let defCounter = 0;

  let currentTerm = '';
  let currentParagraphs: string[] = [];
  let currentNotes: string[] = [];
  let currentSource: string | undefined;
  // The "n.m" marker the current definition sits under, when the document prints one.
  // ISO 32000-1 prints a marker before every term; using it keeps the numbering true to
  // the document even when a term is skipped. Without a marker, number by position.
  let currentMarker: string | undefined;
  // Right after a marker, the next short paragraph is the term whatever it looks like:
  // ISO 32000-1's "… (ellipsis)" and "end-of-line marker (EOL marker)" end with ")" and
  // would otherwise fail isLikelyTerm, dropping the definition and shifting the numbering.
  let expectTerm = false;

  function flush() {
    if (currentTerm && currentParagraphs.length > 0) {
      defCounter++;
      const def: Definition = {
        term: currentTerm,
        definition: currentParagraphs.join(' ').trim(),
        section: currentMarker ?? `${clause}.${defCounter}`,
      };
      if (currentNotes.length > 0) def.notes = [...currentNotes];
      if (currentSource) def.source = currentSource;
      definitions.push(def);
    }
    currentTerm = '';
    currentParagraphs = [];
    currentNotes = [];
    currentSource = undefined;
    currentMarker = undefined;
  }

  let pastIntro = false;

  for (const el of content) {
    // Skip the section heading
    if (el.type === 'heading' && clauseHeading.test(el.text)) {
      continue;
    }

    // Skip heading from a different section (we've left the definitions clause)
    if (el.type === 'heading' && /^\d+\s/.test(el.text) && !el.text.startsWith(`${clause} `)) {
      flush();
      break;
    }

    // Skip lists that are just section number indexes (e.g., "3.1\n3.2\n...")
    if (isNumberList(el, clause)) {
      continue;
    }

    // Detect section number marker (e.g., standalone "3.15" paragraph)
    const marker = detectSectionNumberMarker(el, clause);
    if (marker) {
      if (pastIntro) {
        flush();
      }
      pastIntro = true;
      currentMarker = marker;
      expectTerm = true;

      // If heading contains term (e.g., "3.15 page object")
      if (el.type === 'heading') {
        const termText = el.text.replace(markerPrefix, '').trim();
        if (termText) {
          currentTerm = termText;
          expectTerm = false;
        }
      }
      continue;
    }

    if (el.type === 'paragraph') {
      const text = el.text.trim();

      // The paragraph right after a marker is the term (see expectTerm).
      if (expectTerm) {
        expectTerm = false;
        if (text.length > 0 && text.length < 80) {
          currentTerm = text;
          continue;
        }
      }

      // Skip intro paragraphs before the first definition
      if (!pastIntro) {
        if (isLikelyTerm(text)) {
          // First term found — we're past the intro
          pastIntro = true;
          currentTerm = text;
        }
        continue;
      }

      // After a marker/flush, if we don't have a term yet, this paragraph is the term
      if (!currentTerm && isLikelyTerm(text)) {
        currentTerm = text;
        continue;
      }

      // If we have a term and definition, and see a new term-like paragraph
      if (currentTerm && currentParagraphs.length > 0 && isLikelyTerm(text)) {
        flush();
        currentTerm = text;
        continue;
      }

      // Otherwise, it's part of the definition
      if (currentTerm) {
        const sourceMatch = text.match(/\[SOURCE:\s*([^\]]+)\]/);
        if (sourceMatch) {
          currentSource = sourceMatch[1].trim();
        }
        currentParagraphs.push(text);
      }
    } else if (el.type === 'note' && currentTerm) {
      currentNotes.push(`${el.label}: ${el.text}`);
    }
  }

  flush();
  return definitions;
}

/**
 * Extract all definitions from the definitions clause.
 * Gets that clause's content and parses it for term-definition pairs.
 */
export async function extractAllDefinitions(
  getSectionContentFn: (sectionId: string) => Promise<SectionResult>,
  clause: string = DEFAULT_DEFINITIONS_CLAUSE,
): Promise<Definition[]> {
  const result = await getSectionContentFn(clause);
  return parseSection3Content(result.content, clause);
}
