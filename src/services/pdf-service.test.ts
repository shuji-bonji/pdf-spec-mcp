import { describe, expect, it, vi } from 'vitest';
import type { OutlineEntry } from '../types/index.js';
import type { PDFDocumentProxy } from './pdf-loader.js';
import { PDFSpecService } from './pdf-service.js';

/**
 * Tests for the section boundary ("the seam").
 *
 * Section ranges come from the outline as `[page, nextSection.page - 1]`, so whatever a
 * section spills onto the next section's first page lands outside its own range — and
 * `trimToSectionStart` then drops it from the next section as pre-heading content.
 * Nobody kept it: in ISO 32000-2 that stranded content in 412 sections, requirement text
 * in 271 of them, plus the table rows B-S1 first surfaced (Table 182's `QuadPoints`,
 * Table 166's `CA`/`BM`/`Lang`).
 *
 * getSectionContent now adopts that strip, so get_section / get_requirements / get_tables
 * are all fixed at once. The safety property is that adoption is the exact complement of
 * the trim — see extractOrphanedStrip — so nothing can be counted twice.
 *
 * These fixtures drive the real extractor/collector through an injected fake document, so
 * they exercise the actual rules rather than a restatement of them.
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

describe('getSectionContent — the orphaned strip at the section boundary', () => {
  /** Kinds of the elements a section ends up with, for compact assertions. */
  const kinds = (content: { type: string }[]) => content.map((e) => e.type);

  it('adopts the content stranded on the next section’s first page', async () => {
    const doc = createDoc([
      [headingFixture('1.1 First'), paragraphFixture('Body of 1.1.')],
      [
        paragraphFixture('The tail of 1.1, which spilled over.'),
        headingFixture('1.2 Second'),
        paragraphFixture('Body of 1.2.'),
      ],
    ]);
    const svc = createService(
      doc,
      outline([
        ['1.1 First', 1],
        ['1.2 Second', 2],
      ]),
    );

    const first = await svc.getSectionContent('1.1', 'test-spec');

    expect(kinds(first.content)).toEqual(['heading', 'paragraph', 'paragraph']);
    expect((first.content[2] as { text: string }).text).toBe(
      'The tail of 1.1, which spilled over.',
    );
  });

  it('does not count the strip twice: the next section still excludes it', async () => {
    // The safety property. Adoption is the complement of trimToSectionStart, so the strip
    // lands in exactly one section — never both, never neither.
    const doc = createDoc([
      [headingFixture('1.1 First'), paragraphFixture('Body of 1.1.')],
      [
        paragraphFixture('The tail of 1.1, which spilled over.'),
        headingFixture('1.2 Second'),
        paragraphFixture('Body of 1.2.'),
      ],
    ]);
    const svc = createService(
      doc,
      outline([
        ['1.1 First', 1],
        ['1.2 Second', 2],
      ]),
    );

    const second = await svc.getSectionContent('1.2', 'test-spec');

    expect(kinds(second.content)).toEqual(['heading', 'paragraph']);
    expect((second.content[1] as { text: string }).text).toBe('Body of 1.2.');
  });

  it('adopts nothing when the next section’s heading is not on the seam page', async () => {
    // 69 sections of ISO 32000-2 look like this. trimToSectionStart cannot find the
    // heading, so the next section keeps the whole page — including this strip. Adopting
    // it here as well would duplicate it, so the strip must be left alone.
    const doc = createDoc([
      [headingFixture('1.1 First'), paragraphFixture('Body of 1.1.')],
      [paragraphFixture('Ambiguous content.'), paragraphFixture('More of it.')],
    ]);
    const svc = createService(
      doc,
      outline([
        ['1.1 First', 1],
        ['1.2 Second', 2],
      ]),
    );

    const first = await svc.getSectionContent('1.1', 'test-spec');
    const second = await svc.getSectionContent('1.2', 'test-spec');

    expect(kinds(first.content)).toEqual(['heading', 'paragraph']);
    // The next section is where this content already lives — exactly once, not twice.
    expect(kinds(second.content)).toEqual(['paragraph', 'paragraph']);
  });

  it('adopts nothing when the next section’s heading opens the page', async () => {
    const doc = createDoc([
      [headingFixture('1.1 First'), paragraphFixture('Body of 1.1.')],
      [headingFixture('1.2 Second'), paragraphFixture('Body of 1.2.')],
    ]);
    const svc = createService(
      doc,
      outline([
        ['1.1 First', 1],
        ['1.2 Second', 2],
      ]),
    );

    const first = await svc.getSectionContent('1.1', 'test-spec');

    expect(kinds(first.content)).toEqual(['heading', 'paragraph']);
  });

  it('does not adopt anything when two sections share a page', async () => {
    // endPage is max(page, next.page - 1), so sections sharing a page get endPage === page.
    // There is no seam: `endPage + 1` is a page the next section owns outright.
    //
    // Asserted as the exact element list, not "page 2 is absent": dropping the
    // `next.page === endPage + 1` guard makes adoptOrphanedStrip re-read page *1* (it reads
    // next.page, which is 1 here), duplicating this section's own content rather than
    // stealing page 2's. A "page 2 is absent" check sails straight past that.
    const doc = createDoc([
      [
        headingFixture('1.1 First'),
        paragraphFixture('Body of 1.1.'),
        headingFixture('1.2 Second'),
        paragraphFixture('Body of 1.2.'),
      ],
      [paragraphFixture('Page 2 belongs to 1.2.')],
    ]);
    const svc = createService(
      doc,
      outline([
        ['1.1 First', 1],
        ['1.2 Second', 1],
      ]),
    );

    const first = await svc.getSectionContent('1.1', 'test-spec');

    // Everything on page 1 from 1.1's heading onward, and nothing more. (That this
    // includes 1.2's own content is a separate, pre-existing quirk of sections sharing a
    // page — not something the seam should make worse.)
    expect(kinds(first.content)).toEqual(['heading', 'paragraph', 'heading', 'paragraph']);
  });

  it('adopts nothing for the last section', async () => {
    const doc = createDoc([[headingFixture('1.1 Only'), paragraphFixture('Body.')]]);
    const svc = createService(doc, outline([['1.1 Only', 1]]));

    const only = await svc.getSectionContent('1.1', 'test-spec');

    expect(kinds(only.content)).toEqual(['heading', 'paragraph']);
  });
});

describe('get_tables / get_requirements — fixed by the same seam', () => {
  it('merges table rows stranded past the section’s last page', async () => {
    // Table 182: the QuadPoints row sits on the next section's first page. The strip
    // arrives with the content, so the ordinary continuation rule merges it — getTables
    // itself needs no table-specific boundary handling.
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

  it('leaves the next section’s own table alone', async () => {
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

  it('keeps a stranded table with different headers separate', async () => {
    // Adopted (it is above the next heading, so it is 1.1's content) but not merged:
    // different headers mean it is a different table.
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

    expect(result.totalTables).toBe(2);
    expect(result.tables[0].rows.map((r) => r[0])).toEqual(['A']);
    expect(result.tables[1].rows.map((r) => r[0])).toEqual(['1']);
  });

  it('surfaces requirement text that was stranded in the strip', async () => {
    // The point of generalising B-S1: 271 sections of ISO 32000-2 strand "shall" text.
    const doc = createDoc([
      [headingFixture('1.1 First'), paragraphFixture('An introduction with no requirement.')],
      [paragraphFixture('The value shall be a positive integer.'), headingFixture('1.2 Second')],
    ]);
    const svc = createService(
      doc,
      outline([
        ['1.1 First', 1],
        ['1.2 Second', 2],
      ]),
    );

    const result = await svc.getRequirements('1.1', undefined, 'test-spec');

    expect(result.totalRequirements).toBe(1);
    expect(result.requirements[0].text).toContain('shall be a positive integer');
  });
});
