import { describe, expect, it, vi } from 'vitest';
import type { OutlineEntry } from '../types/index.js';
import { type IndexStore, NullIndexStore } from './index-store.js';
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
function createService(
  doc: PDFDocumentProxy,
  outline: OutlineEntry[],
  store: IndexStore = new NullIndexStore(),
) {
  return createServiceWithLoader(doc, outline, store).service;
}

/** Same, but hands back the (spied) loader so a test can prove it was — or was not — called. */
function createServiceWithLoader(
  doc: PDFDocumentProxy,
  outline: OutlineEntry[],
  store: IndexStore = new NullIndexStore(),
) {
  const registry = {
    getSpecPath: () => '/fake/spec.pdf',
    resolveSpecId: (id?: string) => id ?? 'test-spec',
    enrichSpecInfo: () => {},
  };
  const loader = {
    loadDocument: vi.fn(async () => doc),
    reloadDocument: vi.fn(async () => doc),
    getOutlineWithPages: async () => outline,
  };
  return { service: new PDFSpecService(registry, loader, store), loader };
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

  it('partitions a shared page: neither adoption nor trailing overlap (S-9)', async () => {
    // endPage is max(page, next.page - 1), so sections sharing a page get endPage === page.
    // There is no seam: `endPage + 1` is a page the next section owns outright — and the
    // trailing part of the shared page, from 1.2's heading on, is 1.2's content, cut by
    // trimAfterNextSectionStart. Before S-9 it stayed in 1.1 too, which is how
    // get_tables("8.4.3.3") came to return 8.4.3.4's Table 54 as an incomplete duplicate.
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
    const second = await svc.getSectionContent('1.2', 'test-spec');

    // 1.1: from its own heading up to (not including) 1.2's heading.
    expect(kinds(first.content)).toEqual(['heading', 'paragraph']);
    expect((first.content[1] as { text: string }).text).toBe('Body of 1.1.');
    // 1.2 owns the rest of the page — the page is partitioned, nothing is lost.
    expect(kinds(second.content)).toEqual(['heading', 'paragraph', 'paragraph']);
  });

  it('keeps the whole shared page when the next section’s heading is not found (S-9)', async () => {
    // Mirror of the trimToSectionStart arm: heading missing → the next section keeps the
    // whole page, so cutting here would lose the text entirely. Duplication is the
    // pre-existing, lesser harm.
    const doc = createDoc([
      [headingFixture('1.1 First'), paragraphFixture('Body of 1.1.'), paragraphFixture('More.')],
    ]);
    const svc = createService(
      doc,
      outline([
        ['1.1 First', 1],
        ['1.2 Second', 1], // heading not present on the page
      ]),
    );

    const first = await svc.getSectionContent('1.1', 'test-spec');

    expect(kinds(first.content)).toEqual(['heading', 'paragraph', 'paragraph']);
  });

  it('adopts nothing for the last section', async () => {
    const doc = createDoc([[headingFixture('1.1 Only'), paragraphFixture('Body.')]]);
    const svc = createService(doc, outline([['1.1 Only', 1]]));

    const only = await svc.getSectionContent('1.1', 'test-spec');

    expect(kinds(only.content)).toEqual(['heading', 'paragraph']);
  });
});

describe('getSectionContent — pageRange reflects the spill (S-10)', () => {
  it('extends pageRange.end onto the seam page when the strip is adopted', async () => {
    // §14.9.4 reported 815–815 while its shall/NOTE/EXAMPLE text continued on p.816:
    // content was complete, metadata was short by one page, and page-based follow-ups
    // (reader read_text, veraPDF spot checks) stopped one page early.
    const doc = createDoc([
      [headingFixture('1.1 First'), paragraphFixture('Body of 1.1.')],
      [
        paragraphFixture('The tail of 1.1 on page 2.'),
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
    expect(first.pageRange).toEqual({ start: 1, end: 2 });

    // The cached read must report the same range (the cache stores the reported end).
    const again = await svc.getSectionContent('1.1', 'test-spec');
    expect(again.pageRange).toEqual({ start: 1, end: 2 });
  });

  it('keeps pageRange.end when the next section opens its page (no spill)', async () => {
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
    expect(first.pageRange).toEqual({ start: 1, end: 1 });
  });

  it('keeps pageRange.end when two sections share a page', async () => {
    const doc = createDoc([
      [
        headingFixture('1.1 First'),
        paragraphFixture('Body of 1.1.'),
        headingFixture('1.2 Second'),
        paragraphFixture('Body of 1.2.'),
      ],
    ]);
    const svc = createService(
      doc,
      outline([
        ['1.1 First', 1],
        ['1.2 Second', 1],
      ]),
    );

    const first = await svc.getSectionContent('1.1', 'test-spec');
    expect(first.pageRange).toEqual({ start: 1, end: 1 });
  });
});

describe('getSectionContent — a parent returns its subtree (SV-1)', () => {
  /**
   * The Table 257 shape: the parent's last descendant spills onto the next page.
   * Before SV-1 the parent returned only its preamble; querying the clause by its
   * parent number never showed normative content living only in a child.
   */
  function parentDoc() {
    const doc = createDoc([
      [
        headingFixture('1 Parent'),
        paragraphFixture('Parent preamble.'),
        headingFixture('1.1 First child'),
        paragraphFixture('Child one body.'),
      ],
      [
        headingFixture('1.2 Second child'),
        paragraphFixture('Child two body.'),
        paragraphFixture('Table 257 — Entries in the DocMDP transform parameters dictionary'),
        tableFixture(['Key', 'Type', 'Value'], [['V', 'name', 'The DocMDP transform version.']]),
      ],
      [
        tableFixture(
          ['Key', 'Type', 'Value'],
          [['P', 'number', 'DSS updates shall not be considered as changes.']],
        ),
        headingFixture('2 Next'),
        paragraphFixture('Next clause.'),
      ],
    ]);
    const outline: OutlineEntry[] = [
      {
        title: '1 Parent',
        page: 1,
        sectionNumber: '1',
        children: [
          { title: '1.1 First child', page: 1, sectionNumber: '1.1', children: [] },
          { title: '1.2 Second child', page: 2, sectionNumber: '1.2', children: [] },
        ],
      },
      { title: '2 Next', page: 3, sectionNumber: '2', children: [] },
    ];
    return createService(doc, outline);
  }

  it('aggregates the whole subtree in document order, spill included', async () => {
    const svc = parentDoc();

    const parent = await svc.getSectionContent('1', 'test-spec');

    const texts = parent.content.map((e) => ('text' in e ? (e as { text: string }).text : ''));
    expect(texts).toContain('Parent preamble.');
    expect(texts).toContain('Child one body.');
    expect(texts).toContain('Child two body.');
    // The strip on page 3 — reachable only through 1.2's seam — must be there too.
    const cells = parent.content
      .filter(
        (e): e is { type: 'table'; headers: string[]; rows: string[][] } => e.type === 'table',
      )
      .flatMap((t) => t.rows.flat());
    expect(cells.some((c) => c.includes('shall not be considered as changes'))).toBe(true);
  });

  it('reports the subtree page range, not the preamble’s', async () => {
    const svc = parentDoc();

    const parent = await svc.getSectionContent('1', 'test-spec');

    // 1.2 spills onto page 3 (strip adopted, S-10), so the parent spans 1–3.
    expect(parent.pageRange).toEqual({ start: 1, end: 3 });
  });

  it('surfaces a descendant’s tables through get_tables on the parent (SV-1b)', async () => {
    const svc = parentDoc();

    const tables = await svc.getTables('1', undefined, 'test-spec');

    expect(tables.totalTables).toBeGreaterThanOrEqual(1);
    const cells = tables.tables.flatMap((t) => t.rows.flat());
    expect(cells.some((c) => c.includes('shall not be considered as changes'))).toBe(true);
  });

  it('does not double-count requirements: parent query = subtree of disjoint pieces', async () => {
    const svc = parentDoc();

    const parent = await svc.getRequirements('1', undefined, 'test-spec');
    const leaf = await svc.getRequirements('1.2', undefined, 'test-spec');

    // "shall not be considered as changes" lives once in 1.2's table; the parent
    // aggregation must contain it exactly once, not once per ancestor.
    const count = (reqs: { text: string }[]) =>
      reqs.filter((r) => r.text.includes('shall not be considered as changes')).length;
    expect(count(leaf.requirements)).toBe(1);
    expect(count(parent.requirements)).toBe(1);
  });

  it('keeps the full requirements index on own content — subtree wiring would double-count', async () => {
    // The index iterates flatOrder (parents included). If it were wired to the public
    // getSectionContent, every requirement would be counted once per ancestor.
    const svc = parentDoc();

    const all = await svc.getRequirements(undefined, undefined, 'test-spec');

    const hits = all.requirements.filter((r) =>
      r.text.includes('shall not be considered as changes'),
    );
    expect(hits).toHaveLength(1);
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

  it('does not leave the next section’s table in the previous section (S-9)', async () => {
    // The Table 54 shape: 8.4.3.3 and 8.4.3.4 share page 176; Table 54 (caption, header,
    // first row) sits after 8.4.3.4's heading. 8.4.3.3 used to return it as an incomplete
    // duplicate under its correct caption.
    const doc = createDoc([
      [
        headingFixture('8.4.3.3 Line cap style'),
        paragraphFixture('Table 53 — Line cap styles'),
        tableFixture(['Style', 'Description'], [['0', 'Butt cap']]),
        headingFixture('8.4.3.4 Line join style'),
        paragraphFixture('Table 54 — Line join styles'),
        tableFixture(['Style', 'Description'], [['0', 'Miter join']]),
      ],
    ]);
    const svc = createService(
      doc,
      outline([
        ['8.4.3.3 Line cap style', 1],
        ['8.4.3.4 Line join style', 1],
      ]),
    );

    const first = await svc.getTables('8.4.3.3', undefined, 'test-spec');
    const second = await svc.getTables('8.4.3.4', undefined, 'test-spec');

    expect(first.totalTables).toBe(1);
    expect(first.tables[0].caption).toContain('Table 53');
    expect(second.totalTables).toBe(1);
    expect(second.tables[0].caption).toContain('Table 54');
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

// ========================================
// Issue #6 — the on-disk index store
// ========================================

describe('index store (Issue #6) — a second service reads what the first built', () => {
  /** A store that remembers what was saved, shared between two service instances. */
  class MemoryStore implements IndexStore {
    saved = new Map<string, unknown>();
    loads = 0;
    async load(kind: string, specId: string) {
      this.loads++;
      const data = this.saved.get(`${specId}:${kind}`);
      if (data === undefined) return null;
      return {
        data,
        meta: {} as never,
        path: `memory:${specId}:${kind}`,
        loadTimeMs: 0,
      } as never;
    }
    async save(kind: string, specId: string, _pdfPath: string, data: unknown) {
      this.saved.set(`${specId}:${kind}`, data);
      return `memory:${specId}:${kind}`;
    }
  }

  const twoSectionDoc = () =>
    createDoc([
      [headingFixture('1.1 First'), paragraphFixture('The reader shall accept the first body.')],
      [headingFixture('1.2 Second'), paragraphFixture('The writer should emit the second body.')],
    ]);
  const twoSectionOutline = () =>
    outline([
      ['1.1 First', 1],
      ['1.2 Second', 2],
    ]);

  it('PS-C1: search — the second service never reloads the document, and answers identically', async () => {
    const store = new MemoryStore();
    const first = createServiceWithLoader(twoSectionDoc(), twoSectionOutline(), store);
    const cold = await first.service.searchSpec('body', 10, 'test-spec');
    expect(first.loader.reloadDocument).toHaveBeenCalledTimes(1);
    expect(store.saved.has('test-spec:search')).toBe(true);

    const second = createServiceWithLoader(twoSectionDoc(), twoSectionOutline(), store);
    const warm = await second.service.searchSpec('body', 10, 'test-spec');

    expect(second.loader.reloadDocument).not.toHaveBeenCalled();
    expect(warm).toEqual(cold);
    expect(warm.length).toBe(2);
  });

  it('PS-C2: requirements (full scan) — the second service reads the index instead of scanning', async () => {
    const store = new MemoryStore();
    const first = createServiceWithLoader(twoSectionDoc(), twoSectionOutline(), store);
    const cold = await first.service.getRequirements(undefined, undefined, 'test-spec');
    expect(cold.totalRequirements).toBe(2);
    expect(store.saved.has('test-spec:requirements')).toBe(true);

    const second = createServiceWithLoader(twoSectionDoc(), twoSectionOutline(), store);
    const warm = await second.service.getRequirements(undefined, undefined, 'test-spec');

    // A full scan reads every section's pages; a hit reads none.
    const pagesRead = (second.loader.loadDocument as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(warm).toEqual(cold);
    // getSectionIndex still opens the document once (for titles); nothing beyond that.
    expect(pagesRead).toBeLessThanOrEqual(1);
  });

  it('PS-C3: a store whose load throws is a miss, not a tool failure', async () => {
    const broken: IndexStore = {
      async load() {
        throw new Error('disk on fire');
      },
      async save() {
        throw new Error('disk on fire');
      },
    };
    const { service, loader } = createServiceWithLoader(
      twoSectionDoc(),
      twoSectionOutline(),
      broken,
    );

    const hits = await service.searchSpec('body', 10, 'test-spec');

    expect(hits.length).toBe(2);
    expect(loader.reloadDocument).toHaveBeenCalledTimes(1);
  });

  it('PS-C4: a caller mutating a cached answer does not change the next answer', async () => {
    const store = new MemoryStore();
    const { service } = createServiceWithLoader(twoSectionDoc(), twoSectionOutline(), store);
    await service.searchSpec('body', 10, 'test-spec');

    const second = createServiceWithLoader(twoSectionDoc(), twoSectionOutline(), store).service;
    const before = JSON.stringify(await second.searchSpec('body', 10, 'test-spec'));
    const hits = await second.searchSpec('body', 10, 'test-spec');
    hits[0].snippet = 'vandalised';
    hits.length = 0;
    const after = JSON.stringify(await second.searchSpec('body', 10, 'test-spec'));

    expect(after).toBe(before);
  });
});
