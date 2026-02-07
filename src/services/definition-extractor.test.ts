import { describe, it, expect } from 'vitest';
import { parseDefinitionContent } from './definition-extractor.js';
import type { ContentElement } from '../types/index.js';

describe('parseDefinitionContent', () => {
  it('parses term from heading and definition from paragraphs', () => {
    const content: ContentElement[] = [
      { type: 'heading', level: 3, text: '3.1 approval signature' },
      {
        type: 'paragraph',
        text: 'one or more digital signatures applied to a document',
      },
    ];
    const def = parseDefinitionContent('3.1', content);
    expect(def).not.toBeNull();
    expect(def!.term).toBe('approval signature');
    expect(def!.definition).toBe('one or more digital signatures applied to a document');
    expect(def!.section).toBe('3.1');
  });

  it('concatenates multiple paragraphs', () => {
    const content: ContentElement[] = [
      { type: 'heading', level: 3, text: '3.5 font' },
      { type: 'paragraph', text: 'A collection of glyphs.' },
      { type: 'paragraph', text: 'Used for rendering text on a page.' },
    ];
    const def = parseDefinitionContent('3.5', content);
    expect(def!.definition).toBe('A collection of glyphs. Used for rendering text on a page.');
  });

  it('extracts notes', () => {
    const content: ContentElement[] = [
      { type: 'heading', level: 3, text: '3.10 glyph' },
      { type: 'paragraph', text: 'A graphical shape used to represent a character.' },
      {
        type: 'note',
        label: 'Note 1 to entry',
        text: 'A glyph may correspond to zero or more characters.',
      },
    ];
    const def = parseDefinitionContent('3.10', content);
    expect(def!.notes).toHaveLength(1);
    expect(def!.notes![0]).toBe(
      'Note 1 to entry: A glyph may correspond to zero or more characters.'
    );
  });

  it('extracts source references', () => {
    const content: ContentElement[] = [
      { type: 'heading', level: 3, text: '3.20 ICC profile' },
      {
        type: 'paragraph',
        text: 'A colour profile format [SOURCE: ISO/IEC 9541-1:2012, 3.12]',
      },
    ];
    const def = parseDefinitionContent('3.20', content);
    expect(def!.source).toBe('ISO/IEC 9541-1:2012, 3.12');
  });

  it('returns null for empty content', () => {
    const def = parseDefinitionContent('3.99', []);
    expect(def).toBeNull();
  });

  it('returns null when no heading is present', () => {
    const content: ContentElement[] = [
      { type: 'paragraph', text: 'Just a paragraph without a heading.' },
    ];
    const def = parseDefinitionContent('3.99', content);
    expect(def).toBeNull();
  });

  it('returns null when no definition paragraphs exist', () => {
    const content: ContentElement[] = [{ type: 'heading', level: 3, text: '3.50 orphan term' }];
    const def = parseDefinitionContent('3.50', content);
    expect(def).toBeNull();
  });

  it('strips section number prefix from term', () => {
    const content: ContentElement[] = [
      { type: 'heading', level: 3, text: '3.71 XMP metadata' },
      { type: 'paragraph', text: 'Extensible metadata platform data.' },
    ];
    const def = parseDefinitionContent('3.71', content);
    expect(def!.term).toBe('XMP metadata');
  });

  it('handles definition without notes or source', () => {
    const content: ContentElement[] = [
      { type: 'heading', level: 3, text: '3.2 array object' },
      { type: 'paragraph', text: 'An ordered collection of objects.' },
    ];
    const def = parseDefinitionContent('3.2', content);
    expect(def!.notes).toBeUndefined();
    expect(def!.source).toBeUndefined();
  });
});
