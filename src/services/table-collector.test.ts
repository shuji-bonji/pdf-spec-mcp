import { describe, expect, it } from 'vitest';
import type { ContentElement } from '../types/index.js';
import { collectStructTreeTables } from './table-collector.js';

const caption = (text: string): ContentElement => ({ type: 'paragraph', text });
const table = (headers: string[], rows: string[][]): ContentElement => ({
  type: 'table',
  headers,
  rows,
});

describe('collectStructTreeTables', () => {
  it('merges a continuation into the table it continues', () => {
    const content: ContentElement[] = [
      caption('Table 182 — Additional entries specific to text markup annotations'),
      table(['Key', 'Type', 'Value'], [['Subtype', 'name', 'Highlight']]),
      table(['Key', 'Type', 'Value'], [['QuadPoints', 'array', '8 x n numbers']]),
    ];

    const tables = collectStructTreeTables(content);

    expect(tables).toHaveLength(1);
    expect(tables[0].rows.map((r) => r[0])).toEqual(['Subtype', 'QuadPoints']);
  });

  // ---- S-4: continuations that headers cannot identify ----

  it('merges an adjacent all-blank-header fragment and keeps the chain alive (8.4.3.4 / 10.6.3)', () => {
    // Table 54 arrives as three fragments: headed, blank-headed (image-only rows),
    // then the header restated. The blank fragment used to break the chain, so the
    // restated header no longer matched "the last table" and all three stayed split.
    // Its all-blank rows are fabrications (S-9) and must not survive the merge —
    // only the chain must.
    const content: ContentElement[] = [
      caption('Table 54 — Line join styles'),
      table(['Style', 'Appearance', 'Description'], [['0', '', 'Miter join']]),
      table(
        ['', '', ''],
        [
          ['', '', ''],
          ['', '', ''],
        ],
      ),
      table(
        ['Style', 'Appearance', 'Description'],
        [
          ['1', '', 'Round join'],
          ['2', '', 'Bevel join'],
        ],
      ),
    ];

    const tables = collectStructTreeTables(content);

    expect(tables).toHaveLength(1);
    expect(tables[0].caption).toBe('Table 54 — Line join styles');
    expect(tables[0].rows).toHaveLength(3);
    expect(tables[0].rows.map((r) => r[0])).toEqual(['0', '1', '2']);
  });

  it('merges adjacent headerless fragments of the same width (8.7.4.5.5)', () => {
    const content: ContentElement[] = [
      table(
        [],
        [
          ['1 (fa = fb = 0)', '7 (fi = 2)'],
          ['2 (fc = 1)', '8 (fj = 2)'],
        ],
      ),
      table([], [['6 (fh = 1)', '']]),
    ];

    const tables = collectStructTreeTables(content);

    expect(tables).toHaveLength(1);
    expect(tables[0].headers).toEqual([]);
    expect(tables[0].rows).toHaveLength(3);
  });

  it('does not merge a headerless table separated by prose — it is a different table', () => {
    // 8.7.4.5.5: "Mesh 2 again begins with triangle 1 ..." separates two flag lists.
    const content: ContentElement[] = [
      table([], [['1 (fa = fb = 0)', '7 (fi = 2)']]),
      {
        type: 'paragraph',
        text: 'Mesh 2 again begins with triangle 1 and uses the following edge flags:',
      },
      table([], [['1 (fa = fb = 0)', '4 (ff = 2)']]),
    ];

    expect(collectStructTreeTables(content)).toHaveLength(2);
  });

  it('does not merge an adjacent headerless table of a different width', () => {
    const content: ContentElement[] = [
      table(['Key', 'Type', 'Value'], [['A', 'x', 'y']]),
      table([], [['left', 'right']]),
    ];

    expect(collectStructTreeTables(content)).toHaveLength(2);
  });

  // ---- S-9: fabricated all-blank rows ----

  it('drops all-blank rows: the struct tree has no such TR (S-9)', () => {
    // Page-slicing a Table element that spans pages leaves TRs with no text on this
    // page; they arrived as ["","",""] rows. Table 126 carried six of them.
    const content: ContentElement[] = [
      caption('Table 126 — Predefined spot functions'),
      table(
        ['Name', 'Appearance', 'Definition'],
        [
          ['SimpleDot', '', '1 - (x2+y2)'],
          ['', '', ''],
        ],
      ),
      table(
        ['', '', ''],
        [
          ['', '', ''],
          ['', '', ''],
        ],
      ),
      table(['Name', 'Appearance', 'Definition'], [['Line', '', '-|y|']]),
    ];

    const tables = collectStructTreeTables(content);

    expect(tables).toHaveLength(1);
    expect(tables[0].rows).toEqual([
      ['SimpleDot', '', '1 - (x2+y2)'],
      ['Line', '', '-|y|'],
    ]);
  });

  it('emits nothing for a fragment that is pure page-slicing noise (S-9)', () => {
    // A blank-header fragment whose rows are all blank, not adjacent to any table it
    // could merge into: presenting it as a table would present nothing as spec content.
    const content: ContentElement[] = [
      { type: 'paragraph', text: 'Prose between tables.' },
      table(
        ['', '', ''],
        [
          ['', '', ''],
          ['', '', ''],
        ],
      ),
    ];

    expect(collectStructTreeTables(content)).toHaveLength(0);
  });

  it('drops the blank header row: it holds no text whether restated header or image row', () => {
    const content: ContentElement[] = [
      caption('Table 126 — Predefined spot functions'),
      table(['Name', 'Appearance', 'Definition'], [['SimpleDot', '', '1 - (x2 + y2)']]),
      table(['', '', ''], [['Round', '', '...']]),
    ];

    const tables = collectStructTreeTables(content);

    expect(tables).toHaveLength(1);
    // The blank headers themselves must not appear as a row; the data rows must.
    expect(tables[0].rows).toEqual([
      ['SimpleDot', '', '1 - (x2 + y2)'],
      ['Round', '', '...'],
    ]);
  });

  it('keeps a captioned table separate', () => {
    const content: ContentElement[] = [
      caption('Table 1 — First'),
      table(['Key', 'Value'], [['A', 'a']]),
      caption('Table 2 — Second'),
      table(['Key', 'Value'], [['B', 'b']]),
    ];

    expect(collectStructTreeTables(content)).toHaveLength(2);
  });

  /**
   * The caller's content must come back untouched.
   *
   * `content` is the section content cache. Returning `element.rows` by reference and then
   * pushing continuation rows into it rewrote the cached page, so each call saw a bigger
   * table than the last: get_tables then get_requirements reported 4 table requirements,
   * then 7, then 10. The tools are declared readOnlyHint / idempotentHint — this made them
   * neither. Only found by driving the published server over MCP in call order.
   */
  it('does not mutate the content it was given', () => {
    const content: ContentElement[] = [
      caption('Table 182 — x'),
      table(['Key', 'Type', 'Value'], [['Subtype', 'name', 'a']]),
      table(['Key', 'Type', 'Value'], [['QuadPoints', 'array', 'b']]),
    ];
    const before = JSON.parse(JSON.stringify(content));

    collectStructTreeTables(content);

    expect(content).toEqual(before);
  });

  it('returns the same result however often it is called', () => {
    const content: ContentElement[] = [
      caption('Table 182 — x'),
      table(['Key', 'Type', 'Value'], [['Subtype', 'name', 'a']]),
      table(['Key', 'Type', 'Value'], [['QuadPoints', 'array', 'b']]),
    ];

    const first = collectStructTreeTables(content);
    const second = collectStructTreeTables(content);
    const third = collectStructTreeTables(content);

    expect(second).toEqual(first);
    expect(third).toEqual(first);
  });

  it('hands back rows the caller cannot use to corrupt the cache', () => {
    // Even a caller that mutates the result must not reach the content behind it.
    const content: ContentElement[] = [
      caption('Table 1 — x'),
      table(['Key', 'Value'], [['A', 'a']]),
    ];

    const tables = collectStructTreeTables(content);
    tables[0].rows.push(['injected', 'row']);
    tables[0].headers.push('injected');

    const again = collectStructTreeTables(content);
    expect(again[0].rows).toEqual([['A', 'a']]);
    expect(again[0].headers).toEqual(['Key', 'Value']);
  });

  it('copies continuation rows too — editing a merged cell must not reach the cache', () => {
    // The 0.4.1 fix copied rows at push time, but the merge path still spread the
    // cached inner arrays by reference. Overwriting a cell of a merged row rewrote
    // the cached page.
    const content: ContentElement[] = [
      caption('Table 182 — x'),
      table(['Key', 'Type', 'Value'], [['Subtype', 'name', 'a']]),
      table(['Key', 'Type', 'Value'], [['QuadPoints', 'array', 'b']]),
    ];

    const tables = collectStructTreeTables(content);
    tables[0].rows[1][0] = 'corrupted';

    const again = collectStructTreeTables(content);
    expect(again[0].rows[1]).toEqual(['QuadPoints', 'array', 'b']);
  });
});
