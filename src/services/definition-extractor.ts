/**
 * Definition Extractor
 * Extracts term definitions from Section 3 of the PDF specification.
 *
 * Section 3 has NO subsections in the PDF outline — all 71 definitions
 * appear as flat paragraph sequences within a single section.
 * This extractor parses the content heuristically by detecting term boundaries.
 */

import type { ContentElement, Definition, SectionResult } from '../types/index.js';

/**
 * Detect if a ContentElement is a section number marker (e.g., paragraph "3.1").
 * Returns the section number string or null.
 */
function detectSectionNumberMarker(el: ContentElement): string | null {
  if (el.type === 'paragraph') {
    const match = el.text.trim().match(/^(3\.\d+)$/);
    if (match) return match[1];
  }
  if (el.type === 'heading') {
    const match = el.text.trim().match(/^(3\.\d+)\s/);
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
function isNumberList(el: ContentElement): boolean {
  if (el.type !== 'list') return false;
  return el.items.every((item) => {
    // Each item may have multiple numbers separated by newlines
    const parts = item
      .split(/\n/)
      .map((p) => p.trim())
      .filter(Boolean);
    return parts.every((p) => /^3\.\d+$/.test(p));
  });
}

/**
 * Parse Section 3 content to extract definitions.
 *
 * The content has no structural subsections; definitions appear as:
 *   [optional section number paragraph "3.X"]
 *   [term paragraph - short, no period]
 *   [definition paragraph(s) - longer, with periods]
 *   [optional notes]
 *   ... repeat ...
 */
export function parseSection3Content(content: ContentElement[]): Definition[] {
  const definitions: Definition[] = [];
  let defCounter = 0;

  let currentTerm = '';
  let currentParagraphs: string[] = [];
  let currentNotes: string[] = [];
  let currentSource: string | undefined;

  function flush() {
    if (currentTerm && currentParagraphs.length > 0) {
      defCounter++;
      const def: Definition = {
        term: currentTerm,
        definition: currentParagraphs.join(' ').trim(),
        section: `3.${defCounter}`,
      };
      if (currentNotes.length > 0) def.notes = [...currentNotes];
      if (currentSource) def.source = currentSource;
      definitions.push(def);
    }
    currentTerm = '';
    currentParagraphs = [];
    currentNotes = [];
    currentSource = undefined;
  }

  let pastIntro = false;

  for (const el of content) {
    // Skip the section heading
    if (el.type === 'heading' && el.text.startsWith('3 ')) {
      continue;
    }

    // Skip heading from a different section (we've left Section 3)
    if (el.type === 'heading' && /^[4-9]\s|^[1-9]\d\s/.test(el.text)) {
      flush();
      break;
    }

    // Skip lists that are just section number indexes (e.g., "3.1\n3.2\n...")
    if (isNumberList(el)) {
      continue;
    }

    // Detect section number marker (e.g., standalone "3.15" paragraph)
    const marker = detectSectionNumberMarker(el);
    if (marker) {
      if (pastIntro) {
        flush();
      }
      pastIntro = true;

      // If heading contains term (e.g., "3.15 page object")
      if (el.type === 'heading') {
        const termText = el.text.replace(/^3\.\d+\s+/, '').trim();
        if (termText) {
          currentTerm = termText;
        }
      }
      continue;
    }

    if (el.type === 'paragraph') {
      const text = el.text.trim();

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
 * Extract all definitions from Section 3.
 * Gets Section 3 content and parses it for term-definition pairs.
 */
export async function extractAllDefinitions(
  getSectionContentFn: (sectionId: string) => Promise<SectionResult>
): Promise<Definition[]> {
  const result = await getSectionContentFn('3');
  return parseSection3Content(result.content);
}
