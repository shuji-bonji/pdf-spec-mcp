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
});
