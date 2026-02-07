import { describe, it, expect } from 'vitest';
import { extractRequirementsFromContent, extractSentence } from './requirement-extractor.js';
import type { ContentElement } from '../types/index.js';

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
