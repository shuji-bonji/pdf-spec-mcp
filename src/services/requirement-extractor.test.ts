import { describe, expect, it } from 'vitest';
import type { ContentElement } from '../types/index.js';
import { extractRequirementsFromContent, extractSentence } from './requirement-extractor.js';

describe('extractSentence', () => {
  it('extracts a sentence ending with period', () => {
    const text = 'First sentence. The value shall be positive. Third sentence.';
    const pos = text.indexOf('shall');
    expect(extractSentence(text, pos)).toBe('The value shall be positive.');
  });

  it('handles sentence at start of text', () => {
    const text = 'The value shall be positive. Next sentence.';
    const pos = text.indexOf('shall');
    expect(extractSentence(text, pos)).toBe('The value shall be positive.');
  });

  it('handles sentence at end of text', () => {
    const text = 'First sentence. The value shall be positive';
    const pos = text.indexOf('shall');
    expect(extractSentence(text, pos)).toBe('The value shall be positive');
  });

  it('does not split on decimal numbers', () => {
    const text = 'The version 3.14 shall be used for compliance.';
    const pos = text.indexOf('shall');
    expect(extractSentence(text, pos)).toBe('The version 3.14 shall be used for compliance.');
  });

  it('handles text with no sentence boundaries', () => {
    const text = 'A conforming reader shall support this feature';
    expect(extractSentence(text, text.indexOf('shall'))).toBe(text);
  });
});

describe('extractRequirementsFromContent', () => {
  it('extracts shall requirements from paragraphs', () => {
    const content: ContentElement[] = [
      { type: 'paragraph', text: 'The value shall be a positive integer.' },
    ];
    const reqs = extractRequirementsFromContent(content, '7.3', 'Objects');
    expect(reqs).toHaveLength(1);
    expect(reqs[0].level).toBe('shall');
    expect(reqs[0].text).toBe('The value shall be a positive integer.');
    expect(reqs[0].section).toBe('7.3');
    expect(reqs[0].sectionTitle).toBe('Objects');
    expect(reqs[0].id).toBe('R-7.3-1');
  });

  it('extracts shall not requirements', () => {
    const content: ContentElement[] = [
      { type: 'paragraph', text: 'The key shall not exceed 256 bytes.' },
    ];
    const reqs = extractRequirementsFromContent(content, '7.4', 'Keys');
    expect(reqs).toHaveLength(1);
    expect(reqs[0].level).toBe('shall not');
  });

  it('extracts should and may requirements', () => {
    const content: ContentElement[] = [
      {
        type: 'paragraph',
        text: 'Conforming readers should validate the checksum. Implementations may use caching.',
      },
    ];
    const reqs = extractRequirementsFromContent(content, '8.1', 'Streams');
    expect(reqs).toHaveLength(2);
    expect(reqs[0].level).toBe('should');
    expect(reqs[1].level).toBe('may');
  });

  it('extracts requirements from list items', () => {
    const content: ContentElement[] = [
      { type: 'list', items: ['The reader shall parse the header.', 'The writer may omit it.'] },
    ];
    const reqs = extractRequirementsFromContent(content, '9.1', 'Fonts');
    expect(reqs).toHaveLength(2);
    expect(reqs[0].level).toBe('shall');
    expect(reqs[1].level).toBe('may');
  });

  it('extracts requirements from notes', () => {
    const content: ContentElement[] = [
      { type: 'note', label: 'NOTE', text: 'Implementations should handle this case.' },
    ];
    const reqs = extractRequirementsFromContent(content, '10.1', 'Rendering');
    expect(reqs).toHaveLength(1);
    expect(reqs[0].level).toBe('should');
  });

  it('handles multiple requirements in one paragraph', () => {
    const content: ContentElement[] = [
      {
        type: 'paragraph',
        text: 'The value shall be non-negative. The reader should verify this constraint.',
      },
    ];
    const reqs = extractRequirementsFromContent(content, '7.5', 'Cross-Reference');
    expect(reqs).toHaveLength(2);
  });

  it('assigns sequential IDs', () => {
    const content: ContentElement[] = [
      { type: 'paragraph', text: 'First shall requirement. Second shall item.' },
    ];
    const reqs = extractRequirementsFromContent(content, '7.6', 'Encryption');
    expect(reqs[0].id).toBe('R-7.6-1');
    expect(reqs[1].id).toBe('R-7.6-2');
  });

  it('returns empty array for content with no requirements', () => {
    const content: ContentElement[] = [
      { type: 'paragraph', text: 'This is a plain description of the feature.' },
      { type: 'heading', level: 2, text: 'Overview' },
    ];
    const reqs = extractRequirementsFromContent(content, '1.0', 'Scope');
    expect(reqs).toHaveLength(0);
  });

  it('deduplicates same sentence matched multiple times', () => {
    const content: ContentElement[] = [
      {
        type: 'paragraph',
        text: 'The value shall not be null and shall not be empty.',
      },
    ];
    const reqs = extractRequirementsFromContent(content, '7.3', 'Objects');
    // "shall not" appears twice in same sentence, but they produce different sentences
    // Each "shall not" match extracts the full sentence, which is the same
    // The deduplication should collapse identical level+sentence pairs
    const uniqueTexts = new Set(reqs.map((r) => `${r.level}:${r.text}`));
    expect(uniqueTexts.size).toBe(reqs.length);
  });

  it('is case-insensitive for keywords', () => {
    const content: ContentElement[] = [
      { type: 'paragraph', text: 'The reader Shall support this feature.' },
    ];
    const reqs = extractRequirementsFromContent(content, '7.3', 'Objects');
    expect(reqs).toHaveLength(1);
    expect(reqs[0].level).toBe('shall');
  });
});

/**
 * Requirements stated in tables.
 *
 * ISO keeps much of its normative text in table cells — "(Required) ... shall be
 * Highlight ..." — and scanning prose alone missed all of it: 2739 requirements across
 * ISO 32000-2, a 46% increase over the 5927 found in prose.
 */
describe('extractRequirementsFromContent — tables', () => {
  const caption = (text: string): ContentElement => ({ type: 'paragraph', text });
  const table = (headers: string[], rows: string[][]): ContentElement => ({
    type: 'table',
    headers,
    rows,
  });

  it('extracts a requirement from a table cell, with its table and row key', () => {
    const content: ContentElement[] = [
      caption('Table 182 — Additional entries specific to text markup annotations'),
      table(
        ['Key', 'Type', 'Value'],
        [['Subtype', 'name', '(Required) The type of annotation; shall be Highlight.']],
      ),
    ];

    const reqs = extractRequirementsFromContent(content, '12.5.6.10', 'Text markup annotations');

    expect(reqs).toHaveLength(1);
    expect(reqs[0]).toMatchObject({
      level: 'shall',
      text: '(Required) The type of annotation; shall be Highlight.',
      source: 'table',
      table: 'Table 182 — Additional entries specific to text markup annotations',
      key: 'Subtype',
    });
  });

  it('leaves prose requirements untagged', () => {
    const content: ContentElement[] = [
      { type: 'paragraph', text: 'The value shall be positive.' },
    ];

    const reqs = extractRequirementsFromContent(content, '1.1', 'T');

    expect(reqs).toHaveLength(1);
    expect(reqs[0].source).toBeUndefined();
    expect(reqs[0].table).toBeUndefined();
    expect(reqs[0].key).toBeUndefined();
  });

  it('keeps one sentence per row when the same wording constrains several keys', () => {
    // Real case: Table 51's "A PDF reader shall implicitly reset this parameter..." applies
    // to both `soft mask` and `alpha constant`. The sentences are identical, so without the
    // row key they would look like one requirement — 24 such groups exist in ISO 32000-2.
    const content: ContentElement[] = [
      caption('Table 51 — Device-independent graphics state parameters'),
      table(
        ['Parameter', 'Value'],
        [
          ['soft mask', 'A PDF reader shall implicitly reset this parameter.'],
          ['alpha constant', 'A PDF reader shall implicitly reset this parameter.'],
        ],
      ),
    ];

    const reqs = extractRequirementsFromContent(content, '8.4.2', 'Graphics state');

    expect(reqs).toHaveLength(2);
    expect(reqs.map((r) => r.key)).toEqual(['soft mask', 'alpha constant']);
    expect(new Set(reqs.map((r) => r.id)).size).toBe(2);
  });

  it('attributes a continuation row to the table it continues', () => {
    // The QuadPoints row arrives as a second `table` element with no caption of its own.
    // collectStructTreeTables merges it into Table 182, so the requirement must say so.
    const content: ContentElement[] = [
      caption('Table 182 — Additional entries specific to text markup annotations'),
      table(['Key', 'Type', 'Value'], [['Subtype', 'name', 'It shall be Highlight.']]),
      table(['Key', 'Type', 'Value'], [['QuadPoints', 'array', 'The text shall be oriented.']]),
    ];

    const reqs = extractRequirementsFromContent(content, '12.5.6.10', 'Text markup annotations');

    expect(reqs).toHaveLength(2);
    expect(reqs[1]).toMatchObject({
      key: 'QuadPoints',
      table: 'Table 182 — Additional entries specific to text markup annotations',
    });
  });

  it('does not count a sentence twice when a caption paragraph is itself normative', async () => {
    // Guard against the text-detected-table path being scanned as well: those "tables" are
    // built out of paragraphs the prose loop already reads.
    const content: ContentElement[] = [
      caption('Table 9 — Values that shall be supported'),
      table(['Key', 'Value'], [['A', 'plain text']]),
    ];

    const reqs = extractRequirementsFromContent(content, '7.4', 'Filters');

    expect(reqs).toHaveLength(1);
    expect(reqs[0].source).toBeUndefined(); // found in the caption paragraph, as prose
  });

  it('reports a table with no caption without inventing one', () => {
    const content: ContentElement[] = [
      table(['Key', 'Value'], [['A', 'It shall be set.']]),
    ];

    const reqs = extractRequirementsFromContent(content, '1.1', 'T');

    expect(reqs).toHaveLength(1);
    expect(reqs[0].source).toBe('table');
    expect(reqs[0].key).toBe('A');
    expect(reqs[0].table).toBeUndefined();
  });
});
