import { describe, expect, it } from 'vitest';
import type { ContentElement } from '../types/index.js';
import { parseSection3Content } from './definition-extractor.js';

describe('parseSection3Content', () => {
  it('parses term-definition pairs from paragraphs', () => {
    const content: ContentElement[] = [
      { type: 'heading', level: 2, text: '3 Terms and definitions' },
      { type: 'paragraph', text: 'For the purposes of this document, the following terms apply.' },
      { type: 'paragraph', text: 'approval signature' },
      { type: 'paragraph', text: 'one or more digital signatures applied to a document.' },
    ];
    const defs = parseSection3Content(content);
    expect(defs).toHaveLength(1);
    expect(defs[0].term).toBe('approval signature');
    expect(defs[0].definition).toBe('one or more digital signatures applied to a document.');
    expect(defs[0].section).toBe('3.1');
  });

  it('handles section number markers as paragraphs', () => {
    const content: ContentElement[] = [
      { type: 'heading', level: 2, text: '3 Terms and definitions' },
      { type: 'paragraph', text: '3.1' },
      { type: 'paragraph', text: 'approval signature' },
      { type: 'paragraph', text: 'one or more digital signatures applied to a document.' },
      { type: 'paragraph', text: '3.2' },
      { type: 'paragraph', text: 'array object' },
      { type: 'paragraph', text: 'one-dimensional collection of objects accessible by index.' },
    ];
    const defs = parseSection3Content(content);
    expect(defs).toHaveLength(2);
    expect(defs[0].term).toBe('approval signature');
    expect(defs[0].section).toBe('3.1');
    expect(defs[1].term).toBe('array object');
    expect(defs[1].section).toBe('3.2');
  });

  it('handles section numbers in headings (e.g., "3.5 font")', () => {
    const content: ContentElement[] = [
      { type: 'heading', level: 2, text: '3 Terms and definitions' },
      { type: 'heading', level: 3, text: '3.1 approval signature' },
      { type: 'paragraph', text: 'one or more digital signatures applied to a document.' },
    ];
    const defs = parseSection3Content(content);
    expect(defs).toHaveLength(1);
    expect(defs[0].term).toBe('approval signature');
  });

  it('extracts notes', () => {
    const content: ContentElement[] = [
      { type: 'heading', level: 2, text: '3 Terms and definitions' },
      { type: 'paragraph', text: 'glyph' },
      { type: 'paragraph', text: 'A graphical shape used to represent a character.' },
      {
        type: 'note',
        label: 'Note 1 to entry',
        text: 'A glyph may correspond to zero or more characters.',
      },
    ];
    const defs = parseSection3Content(content);
    expect(defs).toHaveLength(1);
    expect(defs[0].notes).toHaveLength(1);
    expect(defs[0].notes?.[0]).toContain('Note 1 to entry');
  });

  it('extracts source references', () => {
    const content: ContentElement[] = [
      { type: 'heading', level: 2, text: '3 Terms and definitions' },
      { type: 'paragraph', text: 'ICC profile' },
      { type: 'paragraph', text: 'A colour profile format [SOURCE: ISO/IEC 9541-1:2012, 3.12]' },
    ];
    const defs = parseSection3Content(content);
    expect(defs).toHaveLength(1);
    expect(defs[0].source).toBe('ISO/IEC 9541-1:2012, 3.12');
  });

  it('skips number-only list elements', () => {
    const content: ContentElement[] = [
      { type: 'heading', level: 2, text: '3 Terms and definitions' },
      { type: 'paragraph', text: 'For the purposes of this document, terms apply.' },
      { type: 'list', items: ['3.1\n3.2\n3.3'] },
      { type: 'paragraph', text: 'approval signature' },
      { type: 'paragraph', text: 'one or more digital signatures.' },
    ];
    const defs = parseSection3Content(content);
    expect(defs).toHaveLength(1);
    expect(defs[0].term).toBe('approval signature');
  });

  it('concatenates multiple definition paragraphs', () => {
    const content: ContentElement[] = [
      { type: 'heading', level: 2, text: '3 Terms and definitions' },
      { type: 'paragraph', text: 'font' },
      { type: 'paragraph', text: 'A collection of glyphs.' },
      { type: 'paragraph', text: 'Used for rendering text on a page.' },
    ];
    const defs = parseSection3Content(content);
    expect(defs).toHaveLength(1);
    expect(defs[0].definition).toBe('A collection of glyphs. Used for rendering text on a page.');
  });

  it('returns empty array for content with no definitions', () => {
    const content: ContentElement[] = [
      { type: 'heading', level: 2, text: '3 Terms and definitions' },
      { type: 'paragraph', text: 'For the purposes of this document, terms apply.' },
    ];
    const defs = parseSection3Content(content);
    expect(defs).toHaveLength(0);
  });

  it('stops at Section 4 heading', () => {
    const content: ContentElement[] = [
      { type: 'heading', level: 2, text: '3 Terms and definitions' },
      { type: 'paragraph', text: 'font' },
      { type: 'paragraph', text: 'A collection of glyphs.' },
      { type: 'heading', level: 2, text: '4 Notation' },
      { type: 'paragraph', text: 'This is not a definition.' },
    ];
    const defs = parseSection3Content(content);
    expect(defs).toHaveLength(1);
  });

  it('handles sequential definitions without number markers', () => {
    const content: ContentElement[] = [
      { type: 'heading', level: 2, text: '3 Terms and definitions' },
      { type: 'paragraph', text: 'approval signature' },
      { type: 'paragraph', text: 'one or more digital signatures applied to a document.' },
      { type: 'paragraph', text: 'array object' },
      { type: 'paragraph', text: 'one-dimensional collection of objects accessible by index.' },
      { type: 'paragraph', text: 'boolean object' },
      { type: 'paragraph', text: 'an object with a value of true or false.' },
    ];
    const defs = parseSection3Content(content);
    expect(defs).toHaveLength(3);
    expect(defs[0].section).toBe('3.1');
    expect(defs[1].section).toBe('3.2');
    expect(defs[2].section).toBe('3.3');
  });
});

/**
 * ISO 32000-1 (#18): the definitions clause is 4, not 3, every term is preceded by a
 * printed "4.n" marker, and two terms end with ")" — "… (ellipsis)" and
 * "end-of-line marker (EOL marker)".
 */
describe('parseSection3Content with another clause (ISO 32000-1, #18)', () => {
  const clause4: ContentElement[] = [
    { type: 'heading', level: 1, text: '4 Terms and definitions' },
    {
      type: 'paragraph',
      text: 'For the purposes of this document, these terms and definitions apply.',
    },
    { type: 'paragraph', text: '4.1' },
    { type: 'paragraph', text: '… (ellipsis)' },
    {
      type: 'paragraph',
      text: 'An ellipsis is used within PDF examples to indicate omitted detail.',
    },
    { type: 'paragraph', text: '4.2' },
    { type: 'paragraph', text: '8-bit value' },
    { type: 'paragraph', text: '(see byte)' },
    { type: 'paragraph', text: '4.3' },
    { type: 'paragraph', text: 'array object' },
    { type: 'paragraph', text: 'a one-dimensional collection of objects arranged sequentially' },
    { type: 'heading', level: 1, text: '5 Notation' },
    { type: 'paragraph', text: 'Not a definition.' },
  ];

  it('reads clause 4 when told to, and numbers terms by the printed markers', () => {
    const defs = parseSection3Content(clause4, '4');

    expect(defs.map((d) => [d.section, d.term])).toEqual([
      ['4.1', '… (ellipsis)'],
      ['4.2', '8-bit value'],
      ['4.3', 'array object'],
    ]);
    expect(defs[1].definition).toBe('(see byte)');
  });

  it('finds nothing in clause-4 content when reading it as clause 3 (the 0.6.2 symptom)', () => {
    expect(parseSection3Content(clause4, '3')).toEqual([]);
  });

  it('keeps a term that ends with ")" when a marker precedes it', () => {
    const content: ContentElement[] = [
      { type: 'paragraph', text: '4.20' },
      { type: 'paragraph', text: 'end-of-line marker (EOL marker)' },
      {
        type: 'paragraph',
        text: 'one or two character sequence marking the end of a line of text',
      },
    ];

    const defs = parseSection3Content(content, '4');

    expect(defs).toEqual([
      {
        term: 'end-of-line marker (EOL marker)',
        definition: 'one or two character sequence marking the end of a line of text',
        section: '4.20',
      },
    ]);
  });

  it('stops at the next clause heading whatever its number', () => {
    const defs = parseSection3Content(clause4, '4');
    expect(defs.some((d) => d.definition.includes('Not a definition'))).toBe(false);
  });
});
