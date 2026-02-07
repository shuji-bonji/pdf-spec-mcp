/**
 * Definition Extractor
 * Extracts term definitions from Section 3 of the PDF specification.
 * Operates on ContentElement arrays produced by the content extractor.
 */

import type { ContentElement, Definition, SectionIndex, SectionResult } from '../types/index.js';

/**
 * Parse a single definition subsection's content into a Definition.
 * - First HeadingElement → term (strip section number prefix)
 * - ParagraphElements → definition text (concatenated)
 * - NoteElements → notes array
 * - [SOURCE: ...] pattern → source field
 */
export function parseDefinitionContent(
  sectionNumber: string,
  content: ContentElement[]
): Definition | null {
  let term = '';
  const paragraphs: string[] = [];
  const notes: string[] = [];
  let source: string | undefined;

  for (const element of content) {
    switch (element.type) {
      case 'heading':
        if (!term) {
          // Strip section number prefix (e.g., "3.44 page object" → "page object")
          term = element.text.replace(/^\d+(\.\d+)*\s+/, '').trim();
        }
        break;
      case 'paragraph': {
        // Check for [SOURCE: ...] pattern
        const sourceMatch = element.text.match(/\[SOURCE:\s*([^\]]+)\]/);
        if (sourceMatch) {
          source = sourceMatch[1].trim();
        }
        paragraphs.push(element.text);
        break;
      }
      case 'note':
        notes.push(`${element.label}: ${element.text}`);
        break;
    }
  }

  if (!term) return null;

  const definition = paragraphs.join(' ').trim();
  if (!definition) return null;

  const result: Definition = {
    term,
    definition,
    section: sectionNumber,
  };

  if (notes.length > 0) {
    result.notes = notes;
  }
  if (source) {
    result.source = source;
  }

  return result;
}

/**
 * Extract all definitions from Section 3 subsections.
 * Finds all 3.x sections in the index and parses each one.
 */
export async function extractAllDefinitions(
  index: SectionIndex,
  getSectionContentFn: (sectionId: string) => Promise<SectionResult>
): Promise<Definition[]> {
  // Find all direct children of Section 3 (e.g., 3.1, 3.2, ..., 3.71)
  const definitionSections = index.flatOrder.filter((s) => /^3\.\d+$/.test(s.sectionNumber));

  const definitions: Definition[] = [];

  for (const sec of definitionSections) {
    try {
      const result = await getSectionContentFn(sec.sectionNumber);
      const def = parseDefinitionContent(sec.sectionNumber, result.content);
      if (def) {
        definitions.push(def);
      }
    } catch {
      // Skip sections that fail to extract (shouldn't happen, but be robust)
      continue;
    }
  }

  return definitions;
}
