import { describe, it, expect } from 'vitest';
import { buildSectionIndex, findSection } from './outline-resolver.js';
import type { OutlineEntry } from '../types/index.js';

function makeOutline(): OutlineEntry[] {
  return [
    {
      title: '7 Syntax',
      page: 50,
      sectionNumber: '7',
      children: [
        {
          title: '7.1 General',
          page: 50,
          sectionNumber: '7.1',
          children: [],
        },
        {
          title: '7.2 Lexical conventions',
          page: 55,
          sectionNumber: '7.2',
          children: [],
        },
        {
          title: '7.3 Objects',
          page: 58,
          sectionNumber: '7.3',
          children: [
            {
              title: '7.3.1 General',
              page: 58,
              sectionNumber: '7.3.1',
              children: [],
            },
            {
              title: '7.3.4 String objects',
              page: 62,
              sectionNumber: '7.3.4',
              children: [],
            },
          ],
        },
      ],
    },
    {
      title: '8 Graphics',
      page: 100,
      sectionNumber: '8',
      children: [],
    },
    {
      title: 'Annex A (normative) Operator summary',
      page: 900,
      sectionNumber: 'Annex A',
      children: [
        {
          title: 'Annex A.1 Details',
          page: 905,
          sectionNumber: 'Annex A.1',
          children: [],
        },
      ],
    },
  ];
}

describe('buildSectionIndex', () => {
  const outline = makeOutline();
  const index = buildSectionIndex(outline, 1020);

  it('creates flat order from DFS traversal', () => {
    const sectionNumbers = index.flatOrder.map((s) => s.sectionNumber);
    expect(sectionNumbers).toEqual([
      '7',
      '7.1',
      '7.2',
      '7.3',
      '7.3.1',
      '7.3.4',
      '8',
      'Annex A',
      'Annex A.1',
    ]);
  });

  it('calculates endPage from next section start', () => {
    const s71 = index.sections.get('7.1');
    expect(s71?.page).toBe(50);
    expect(s71?.endPage).toBe(54); // next is 7.2 at page 55

    const s72 = index.sections.get('7.2');
    expect(s72?.endPage).toBe(57); // next is 7.3 at page 58
  });

  it('sets last section endPage to totalPages', () => {
    const lastSection = index.sections.get('Annex A.1');
    expect(lastSection?.endPage).toBe(1020);
  });

  it('extracts title without section number', () => {
    const s7 = index.sections.get('7');
    expect(s7?.title).toBe('Syntax');

    const s734 = index.sections.get('7.3.4');
    expect(s734?.title).toBe('String objects');
  });

  it('strips normative/informative annotation from Annex titles', () => {
    const annexA = index.sections.get('Annex A');
    expect(annexA?.title).toBe('Operator summary');
  });

  it('records depth correctly', () => {
    expect(index.sections.get('7')?.depth).toBe(0);
    expect(index.sections.get('7.1')?.depth).toBe(1);
    expect(index.sections.get('7.3.4')?.depth).toBe(2);
  });

  it('records parent references', () => {
    expect(index.sections.get('7')?.parent).toBeNull();
    expect(index.sections.get('7.1')?.parent).toBe('7');
    expect(index.sections.get('7.3.4')?.parent).toBe('7.3');
  });

  it('records children references', () => {
    const s7 = index.sections.get('7');
    expect(s7?.children).toEqual(['7.1', '7.2', '7.3']);

    const s73 = index.sections.get('7.3');
    expect(s73?.children).toEqual(['7.3.1', '7.3.4']);
  });

  it('preserves tree structure', () => {
    expect(index.tree).toBe(outline);
  });

  it('stores totalPages', () => {
    expect(index.totalPages).toBe(1020);
  });

  it('skips entries with unresolvable pages (page < 1)', () => {
    const outlineWithBadEntry: OutlineEntry[] = [
      { title: '1 Good', page: 10, sectionNumber: '1', children: [] },
      { title: '2 Bad', page: -1, sectionNumber: '2', children: [] },
      { title: '3 Good', page: 30, sectionNumber: '3', children: [] },
    ];
    const idx = buildSectionIndex(outlineWithBadEntry, 100);
    expect(idx.flatOrder.map((s) => s.sectionNumber)).toEqual(['1', '3']);
    expect(idx.sections.has('2')).toBe(false);
  });
});

describe('findSection', () => {
  const outline = makeOutline();
  const index = buildSectionIndex(outline, 1020);

  it('finds by exact section number', () => {
    const result = findSection(index, '7.3.4');
    expect(result?.title).toBe('String objects');
  });

  it('finds by case-insensitive match', () => {
    const result = findSection(index, 'annex a');
    expect(result?.title).toBe('Operator summary');
  });

  it('finds Annex by single letter shorthand', () => {
    const result = findSection(index, 'A');
    expect(result?.title).toBe('Operator summary');
  });

  it('returns undefined for non-existent section', () => {
    expect(findSection(index, '99.99')).toBeUndefined();
  });
});
