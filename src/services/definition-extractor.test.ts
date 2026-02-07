import { describe, it, expect } from 'vitest';
import { parseSection3Content } from './definition-extractor.js';
import type { ContentElement } from '../types/index.js';

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
    expect(defs[0].notes![0]).toContain('Note 1 to entry');
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
