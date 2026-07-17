import { describe, expect, it, vi } from 'vitest';
import type { OutlineEntry } from '../types/index.js';
import type { PDFDocumentProxy } from './pdf-loader.js';
import { PDFSpecService } from './pdf-service.js';

/**
 * Tests for table continuation across the section boundary ("the seam").
 *
 * Section ranges end at `nextSection.page - 1`, so a table that spills over its
 * section's last page leaves its remaining rows at the top of the next section's
 * first page — a strip that belonged to no section and was silently dropped.
 * In the real ISO 32000-2 this cost Table 182 its `QuadPoints` row and Table 166
 * its `CA` / `BM` / `Lang` rows.
 *
 * These fixtures drive the real extractor/collector through an injected fake
 * document, so they exercise the actual merge rule rather than a restatement of it.
 */

// ========================================
// Fixture builders
// ========================================

interface Cell {
  id: string;
  text: string;
}

let cellSeq = 0;

/** A Table struct node plus the text items its cells reference. */
function tableFixture(headers: string[], rows: string[][]) {
  const cells: Cell[] = [];
  const mkRow = (role: 'TH' | 'TD', values: string[]) => ({
    role: 'TR',
    children: values.map((text) => {
      const id = `c${cellSeq++}`;
      cells.push({ id, text });
      return { role, children: [{ type: 'content', id }] };
    }),
  });

  const children = [];
  if (headers.length > 0) children.push(mkRow('TH', headers));
  for (const row of rows) children.push(mkRow('TD', row));

  return { node: { role: 'Table', children }, cells };
}

/** A paragraph struct node (used for captions like "Table 182 — ..."). */
function paragraphFixture(text: string) {
  const id = `c${cellSeq++}`;
  return { node: { role: 'P', children: [{ type: 'content', id }] }, cells: [{ id, text }] };
}

/** A heading struct node ("12.5.6.11 Caret annotations"). */
function headingFixture(text: string) {
  const id = `c${cellSeq++}`;
  return { node: { role: 'H2', children: [{ type: 'content', id }] }, cells: [{ id, text }] };
}

interface PageFixture {
  node: unknown;
  cells: Cell[];
}

/** Assemble a fake PDFDocumentProxy from per-page fixtures. */
function createDoc(pages: PageFixture[][]): PDFDocumentProxy {
  return {
    numPages: pages.length,
    getPage: vi.fn(async (pageNum: number) => {
      const parts = pages[pageNum - 1] ?? [];
      const cells = parts.flatMap((p) => p.cells);
      return {
        getStructTree: async () => ({
          role: 'Document',
          children: parts.map((p) => p.node),
        }),
        getTextContent: async () => ({
          items: cells.flatMap((c) => [
            { type: 'beginMarkedContentProps', id: c.id },
            { str: c.text, hasEOL: false },
            { type: 'endMarkedContent' },
          ]),
          styles: {},
        }),
      };
    }),
  } as unknown as PDFDocumentProxy;
}

/** Wire a service around a fake doc and outline. */
function createService(doc: PDFDocumentProxy, outline: OutlineEntry[]) {
  const registry = {
    getSpecPath: () => '/fake/spec.pdf',
    resolveSpecId: (id?: string) => id ?? 'test-spec',
    enrichSpecInfo: () => {},
  };
  const loader = {
    loadDocument: async () => doc,
    reloadDocument: async () => doc,
    getOutlineWithPages: async () => outline,
  };
  return new PDFSpecService(registry, loader);
}

/** Flat outline: ['1.1 First', 1] → section "1.1" starting on page 1. */
const outline = (entries: [string, number][]): OutlineEntry[] =>
  entries.map(([title, page]) => ({
    title,
    page,
    sectionNumber: title.split(' ')[0],
    children: [],
  }));

// ========================================
// Tests
// ========================================

describe('getTables — continuation across the section boundary', () => {
  it('reclaims rows stranded on the next section’s first page', async () => {
    // Mirrors Table 182: section 1.1 ends on p.1, its table continues atop p.2,
    // where section 1.2 begins. endPage is 1, so p.2 was never scanned.
    const doc = createDoc([
      [
        headingFixture('1.1 Text markup annotations'),
        paragraphFixture('Table 182 — Additional entries specific to text markup annotations'),
        tableFixture(['Key', 'Type', 'Value'], [['Subtype', 'name', 'Highlight']]),
      ],
      [
        tableFixture(['Key', 'Type', 'Value'], [['QuadPoints', 'array', 'An array of 8 x n']]),
        paragraphFixture('Figure 84 — QuadPoints specification'),
        headingFixture('1.2 Caret annotations'),
        paragraphFixture('Table 183 — Additional entries specific to a caret annotation'),
        tableFixture(['Key', 'Type', 'Value'], [['Sy', 'name', 'A symbol']]),
      ],
    ]);
    const svc = createService(
      doc,
      outline([
        ['1.1 Text markup annotations', 1],
        ['1.2 Caret annotations', 2],
      ]),
    );

    const result = await svc.getTables('1.1', undefined, 'test-spec');

    expect(result.totalTables).toBe(1);
    expect(result.tables[0].caption).toContain('Table 182');
    expect(result.tables[0].rows.map((r) => r[0])).toEqual(['Subtype', 'QuadPoints']);
  });

  it('does not pull the next section’s captioned table into this one', async () => {
    // The strip above the next heading is empty: p.2 opens with section 1.2 directly.
    // A table with the same headers sits just below — it must stay put.
    const doc = createDoc([
      [
        headingFixture('1.1 First'),
        paragraphFixture('Table 1 — First table'),
        tableFixture(['Key', 'Type', 'Value'], [['A', 'name', 'a']]),
      ],
      [
        headingFixture('1.2 Second'),
        paragraphFixture('Table 2 — Second table'),
        tableFixture(['Key', 'Type', 'Value'], [['B', 'name', 'b']]),
      ],
    ]);
    const svc = createService(
      doc,
      outline([
        ['1.1 First', 1],
        ['1.2 Second', 2],
      ]),
    );

    const result = await svc.getTables('1.1', undefined, 'test-spec');

    expect(result.totalTables).toBe(1);
    expect(result.tables[0].rows.map((r) => r[0])).toEqual(['A']);
  });

  it('stops at a caption even when it precedes the next heading', async () => {
    // A captioned table above the heading is a new table, not a continuation.
    const doc = createDoc([
      [
        headingFixture('1.1 First'),
        paragraphFixture('Table 1 — First table'),
        tableFixture(['Key', 'Type', 'Value'], [['A', 'name', 'a']]),
      ],
      [
        paragraphFixture('Table 2 — Second table'),
        tableFixture(['Key', 'Type', 'Value'], [['B', 'name', 'b']]),
        headingFixture('1.2 Second'),
      ],
    ]);
    const svc = createService(
      doc,
      outline([
        ['1.1 First', 1],
        ['1.2 Second', 2],
      ]),
    );

    const result = await svc.getTables('1.1', undefined, 'test-spec');

    expect(result.tables[0].rows.map((r) => r[0])).toEqual(['A']);
  });

  it('does not merge a continuation whose headers differ', async () => {
    const doc = createDoc([
      [
        headingFixture('1.1 First'),
        paragraphFixture('Table 1 — First table'),
        tableFixture(['Key', 'Type', 'Value'], [['A', 'name', 'a']]),
      ],
      [
        tableFixture(['Bit position', 'Name', 'Meaning'], [['1', 'Invisible', 'x']]),
        headingFixture('1.2 Second'),
      ],
    ]);
    const svc = createService(
      doc,
      outline([
        ['1.1 First', 1],
        ['1.2 Second', 2],
      ]),
    );

    const result = await svc.getTables('1.1', undefined, 'test-spec');

    expect(result.totalTables).toBe(1);
    expect(result.tables[0].rows.map((r) => r[0])).toEqual(['A']);
  });

  it('follows a continuation that spans several full pages', async () => {
    // Mirrors Table 166 / Annex A: whole pages of continuation with no heading.
    const doc = createDoc([
      [
        headingFixture('1.1 First'),
        paragraphFixture('Table 1 — Long table'),
        tableFixture(['Key', 'Type', 'Value'], [['A', 'name', 'a']]),
      ],
      [tableFixture(['Key', 'Type', 'Value'], [['B', 'name', 'b']])],
      [tableFixture(['Key', 'Type', 'Value'], [['C', 'name', 'c']])],
      [tableFixture(['Key', 'Type', 'Value'], [['D', 'name', 'd']]), headingFixture('1.2 Second')],
    ]);
    const svc = createService(
      doc,
      outline([
        ['1.1 First', 1],
        ['1.2 Second', 4],
      ]),
    );

    const result = await svc.getTables('1.1', undefined, 'test-spec');

    expect(result.totalTables).toBe(1);
    expect(result.tables[0].rows.map((r) => r[0])).toEqual(['A', 'B', 'C', 'D']);
  });

  it('leaves a headerless table alone rather than inventing a second table', async () => {
    // collectStructTreeTables refuses to merge headerless tables, so appending rows it
    // will not merge would add a spurious table and shift every table_index after it.
    // Observed in 8.7.4.5.5. The row stays missing; the index stays correct.
    const doc = createDoc([
      [headingFixture('1.1 First'), tableFixture([], [['1', 'first']])],
      [tableFixture([], [['2', 'second']]), headingFixture('1.2 Second')],
    ]);
    const svc = createService(
      doc,
      outline([
        ['1.1 First', 1],
        ['1.2 Second', 2],
      ]),
    );

    const result = await svc.getTables('1.1', undefined, 'test-spec');

    expect(result.totalTables).toBe(1);
    expect(result.tables[0].rows).toEqual([['1', 'first']]);
  });

  it('does not scan ahead when the section does not end with a table', async () => {
    const doc = createDoc([
      [
        headingFixture('1.1 First'),
        paragraphFixture('Table 1 — First table'),
        tableFixture(['Key', 'Type', 'Value'], [['A', 'name', 'a']]),
        paragraphFixture('Some closing prose after the table.'),
      ],
      [tableFixture(['Key', 'Type', 'Value'], [['B', 'name', 'b']]), headingFixture('1.2 Second')],
    ]);
    const svc = createService(
      doc,
      outline([
        ['1.1 First', 1],
        ['1.2 Second', 2],
      ]),
    );

    const result = await svc.getTables('1.1', undefined, 'test-spec');

    expect(result.tables[0].rows.map((r) => r[0])).toEqual(['A']);
  });

  it('does not run past the last page', async () => {
    const doc = createDoc([
      [
        headingFixture('1.1 Only'),
        paragraphFixture('Table 1 — Only table'),
        tableFixture(['Key', 'Type', 'Value'], [['A', 'name', 'a']]),
      ],
    ]);
    const svc = createService(doc, outline([['1.1 Only', 1]]));

    const result = await svc.getTables('1.1', undefined, 'test-spec');

    expect(result.tables[0].rows.map((r) => r[0])).toEqual(['A']);
  });
});
