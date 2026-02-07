import { describe, it, expect } from 'vitest';
import { searchTextIndex } from './search-index.js';
import type { SectionIndex, TextIndex, SectionInfo } from '../types/index.js';

function createTestIndex(): { textIndex: TextIndex; sectionIndex: SectionIndex } {
  const sectionA: SectionInfo = {
    sectionNumber: '7.3',
    title: 'Objects',
    page: 50,
    endPage: 70,
    depth: 1,
    parent: '7',
    children: [],
  };
  const sectionB: SectionInfo = {
    sectionNumber: '12.8',
    title: 'Digital Signatures',
    page: 590,
    endPage: 620,
    depth: 1,
    parent: '12',
    children: [],
  };

  const sections = new Map<string, SectionInfo>();
  sections.set('7.3', sectionA);
  sections.set('12.8', sectionB);

  const sectionIndex: SectionIndex = {
    tree: [],
    sections,
    flatOrder: [sectionA, sectionB],
    totalPages: 1020,
  };

  const textIndex: TextIndex = {
    pages: [
      { page: 50, section: '7.3', text: 'Boolean objects shall have a value of true or false.' },
      { page: 55, section: '7.3', text: 'String objects are represented as a sequence of bytes.' },
      {
        page: 590,
        section: '12.8',
        text: 'A digital signature (PDF 2.0) provides authentication.',
      },
      {
        page: 595,
        section: '12.8',
        text: 'The digital signature handler shall validate the signature.',
      },
      { page: 600, section: '12.8', text: 'Timestamp digital signature support is required.' },
    ],
    buildTime: 100,
  };

  return { textIndex, sectionIndex };
}

describe('searchTextIndex', () => {
  const { textIndex, sectionIndex } = createTestIndex();

  it('finds pages matching a query', () => {
    const results = searchTextIndex(textIndex, 'digital signature', 10, sectionIndex);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].section).toBe('12.8');
  });

  it('is case-insensitive', () => {
    const results = searchTextIndex(textIndex, 'DIGITAL SIGNATURE', 10, sectionIndex);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].section).toBe('12.8');
  });

  it('returns empty array for no matches', () => {
    const results = searchTextIndex(textIndex, 'nonexistent_xyz_term', 10, sectionIndex);
    expect(results).toEqual([]);
  });

  it('respects maxResults limit', () => {
    const results = searchTextIndex(textIndex, 'shall', 1, sectionIndex);
    expect(results.length).toBe(1);
  });

  it('deduplicates results by section', () => {
    // 'digital signature' appears on 3 pages in section 12.8
    const results = searchTextIndex(textIndex, 'digital signature', 10, sectionIndex);
    const sections = results.map((r) => r.section);
    const unique = new Set(sections);
    expect(sections.length).toBe(unique.size);
  });

  it('scores by occurrence count (higher = more occurrences)', () => {
    // Section 12.8 has 'digital signature' on 3 pages vs 7.3 has 0
    const results = searchTextIndex(textIndex, 'digital signature', 10, sectionIndex);
    expect(results[0].section).toBe('12.8');
    expect(results[0].score).toBeGreaterThan(0);
  });

  it('generates snippets with context', () => {
    const results = searchTextIndex(textIndex, 'authentication', 10, sectionIndex);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].snippet).toContain('authentication');
  });

  it('resolves section titles', () => {
    const results = searchTextIndex(textIndex, 'digital signature', 10, sectionIndex);
    expect(results[0].title).toBe('Digital Signatures');
  });

  it('searches across multiple sections', () => {
    const results = searchTextIndex(textIndex, 'shall', 10, sectionIndex);
    const sections = results.map((r) => r.section);
    expect(sections).toContain('7.3');
    expect(sections).toContain('12.8');
  });
});
