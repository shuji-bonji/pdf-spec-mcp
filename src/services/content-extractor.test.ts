import { describe, expect, it, vi } from 'vitest';
import type { ContentElement } from '../types/index.js';
import {
  extractPageSegments,
  extractSectionContent,
  trimAfterNextSectionStart,
} from './content-extractor.js';

// Helper to create a mock PDFDocumentProxy
function createMockDoc(pages: MockPageData[]) {
  return {
    getPage: vi.fn(async (pageNum: number) => {
      const data = pages[pageNum - 1];
      if (!data) throw new Error(`Page ${pageNum} not found`);
      return {
        getStructTree: vi.fn(async () => data.structTree),
        getTextContent: vi.fn(async () => ({
          items: data.textItems,
          styles: {},
        })),
      };
    }),
  } as unknown as import('./pdf-loader.js').PDFDocumentProxy;
}

interface MockPageData {
  structTree: MockStructTreeNode | null;
  textItems: MockTextItem[];
}

interface MockStructTreeNode {
  role: string;
  children: (MockStructTreeNode | MockStructTreeContent)[];
}

interface MockStructTreeContent {
  type: 'content';
  id: string;
}

type MockTextItem =
  | { str: string; hasEOL: boolean }
  | { type: 'beginMarkedContentProps' | 'endMarkedContent'; id?: string };

describe('extractSectionContent', () => {
  it('extracts heading elements from H1-H6 roles', async () => {
    const doc = createMockDoc([
      {
        structTree: {
          role: 'Document',
          children: [
            {
              role: 'H1',
              children: [{ type: 'content', id: 'mc0' }],
            },
            {
              role: 'H3',
              children: [{ type: 'content', id: 'mc1' }],
            },
          ],
        },
        textItems: [
          { type: 'beginMarkedContentProps', id: 'mc0' },
          { str: '7 Syntax', hasEOL: false },
          { type: 'endMarkedContent' },
          { type: 'beginMarkedContentProps', id: 'mc1' },
          { str: '7.3 Objects', hasEOL: false },
          { type: 'endMarkedContent' },
        ],
      },
    ]);

    const elements = await extractSectionContent(doc, 1, 1);

    expect(elements).toEqual([
      { type: 'heading', level: 1, text: '7 Syntax' },
      { type: 'heading', level: 3, text: '7.3 Objects' },
    ]);
  });

  it('extracts paragraph elements from P role', async () => {
    const doc = createMockDoc([
      {
        structTree: {
          role: 'Document',
          children: [
            {
              role: 'P',
              children: [{ type: 'content', id: 'mc0' }],
            },
          ],
        },
        textItems: [
          { type: 'beginMarkedContentProps', id: 'mc0' },
          { str: 'PDF is a portable document format.', hasEOL: false },
          { type: 'endMarkedContent' },
        ],
      },
    ]);

    const elements = await extractSectionContent(doc, 1, 1);

    expect(elements).toEqual([{ type: 'paragraph', text: 'PDF is a portable document format.' }]);
  });

  it('detects NOTE/EXAMPLE paragraphs as NoteElement', async () => {
    const doc = createMockDoc([
      {
        structTree: {
          role: 'Document',
          children: [
            {
              role: 'P',
              children: [{ type: 'content', id: 'mc0' }],
            },
            {
              role: 'P',
              children: [{ type: 'content', id: 'mc1' }],
            },
          ],
        },
        textItems: [
          { type: 'beginMarkedContentProps', id: 'mc0' },
          { str: 'NOTE 1 This is a note.', hasEOL: false },
          { type: 'endMarkedContent' },
          { type: 'beginMarkedContentProps', id: 'mc1' },
          { str: 'EXAMPLE An example here.', hasEOL: false },
          { type: 'endMarkedContent' },
        ],
      },
    ]);

    const elements = await extractSectionContent(doc, 1, 1);

    expect(elements[0]).toEqual({
      type: 'note',
      label: 'NOTE 1',
      text: 'This is a note.',
    });
    expect(elements[1]).toEqual({
      type: 'note',
      label: 'EXAMPLE',
      text: 'An example here.',
    });
  });

  it('extracts list elements from L/LI roles', async () => {
    const doc = createMockDoc([
      {
        structTree: {
          role: 'Document',
          children: [
            {
              role: 'L',
              children: [
                {
                  role: 'LI',
                  children: [
                    { role: 'Lbl', children: [{ type: 'content', id: 'lbl0' }] },
                    { role: 'LBody', children: [{ type: 'content', id: 'mc0' }] },
                  ],
                },
                {
                  role: 'LI',
                  children: [
                    { role: 'Lbl', children: [{ type: 'content', id: 'lbl1' }] },
                    { role: 'LBody', children: [{ type: 'content', id: 'mc1' }] },
                  ],
                },
              ],
            },
          ],
        },
        textItems: [
          { type: 'beginMarkedContentProps', id: 'lbl0' },
          { str: '— ', hasEOL: false },
          { type: 'endMarkedContent' },
          { type: 'beginMarkedContentProps', id: 'mc0' },
          { str: 'First item', hasEOL: false },
          { type: 'endMarkedContent' },
          { type: 'beginMarkedContentProps', id: 'lbl1' },
          { str: '— ', hasEOL: false },
          { type: 'endMarkedContent' },
          { type: 'beginMarkedContentProps', id: 'mc1' },
          { str: 'Second item', hasEOL: false },
          { type: 'endMarkedContent' },
        ],
      },
    ]);

    const elements = await extractSectionContent(doc, 1, 1);

    expect(elements).toEqual([{ type: 'list', items: ['First item', 'Second item'] }]);
  });

  it('extracts table elements from Table/TR/TH/TD', async () => {
    const doc = createMockDoc([
      {
        structTree: {
          role: 'Document',
          children: [
            {
              role: 'Table',
              children: [
                {
                  role: 'TR',
                  children: [
                    { role: 'TH', children: [{ type: 'content', id: 'h0' }] },
                    { role: 'TH', children: [{ type: 'content', id: 'h1' }] },
                  ],
                },
                {
                  role: 'TR',
                  children: [
                    { role: 'TD', children: [{ type: 'content', id: 'd0' }] },
                    { role: 'TD', children: [{ type: 'content', id: 'd1' }] },
                  ],
                },
              ],
            },
          ],
        },
        textItems: [
          { type: 'beginMarkedContentProps', id: 'h0' },
          { str: 'Key', hasEOL: false },
          { type: 'endMarkedContent' },
          { type: 'beginMarkedContentProps', id: 'h1' },
          { str: 'Value', hasEOL: false },
          { type: 'endMarkedContent' },
          { type: 'beginMarkedContentProps', id: 'd0' },
          { str: 'Name', hasEOL: false },
          { type: 'endMarkedContent' },
          { type: 'beginMarkedContentProps', id: 'd1' },
          { str: 'PDF', hasEOL: false },
          { type: 'endMarkedContent' },
        ],
      },
    ]);

    const elements = await extractSectionContent(doc, 1, 1);

    expect(elements).toEqual([
      {
        type: 'table',
        headers: ['Key', 'Value'],
        rows: [['Name', 'PDF']],
      },
    ]);
  });

  it('extracts table with THead/TBody wrappers', async () => {
    const doc = createMockDoc([
      {
        structTree: {
          role: 'Document',
          children: [
            {
              role: 'Table',
              children: [
                {
                  role: 'THead',
                  children: [
                    {
                      role: 'TR',
                      children: [
                        { role: 'TH', children: [{ type: 'content', id: 'h0' }] },
                        { role: 'TH', children: [{ type: 'content', id: 'h1' }] },
                        { role: 'TH', children: [{ type: 'content', id: 'h2' }] },
                      ],
                    },
                  ],
                },
                {
                  role: 'TBody',
                  children: [
                    {
                      role: 'TR',
                      children: [
                        { role: 'TH', children: [{ type: 'content', id: 'k0' }] },
                        { role: 'TD', children: [{ type: 'content', id: 't0' }] },
                        { role: 'TD', children: [{ type: 'content', id: 'v0' }] },
                      ],
                    },
                    {
                      role: 'TR',
                      children: [
                        { role: 'TH', children: [{ type: 'content', id: 'k1' }] },
                        { role: 'TD', children: [{ type: 'content', id: 't1' }] },
                        { role: 'TD', children: [{ type: 'content', id: 'v1' }] },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        textItems: [
          { type: 'beginMarkedContentProps', id: 'h0' },
          { str: 'Key', hasEOL: false },
          { type: 'endMarkedContent' },
          { type: 'beginMarkedContentProps', id: 'h1' },
          { str: 'Type', hasEOL: false },
          { type: 'endMarkedContent' },
          { type: 'beginMarkedContentProps', id: 'h2' },
          { str: 'Value', hasEOL: false },
          { type: 'endMarkedContent' },
          { type: 'beginMarkedContentProps', id: 'k0' },
          { str: 'LW', hasEOL: false },
          { type: 'endMarkedContent' },
          { type: 'beginMarkedContentProps', id: 't0' },
          { str: 'number', hasEOL: false },
          { type: 'endMarkedContent' },
          { type: 'beginMarkedContentProps', id: 'v0' },
          { str: 'Line width.', hasEOL: false },
          { type: 'endMarkedContent' },
          { type: 'beginMarkedContentProps', id: 'k1' },
          { str: 'LC', hasEOL: false },
          { type: 'endMarkedContent' },
          { type: 'beginMarkedContentProps', id: 't1' },
          { str: 'integer', hasEOL: false },
          { type: 'endMarkedContent' },
          { type: 'beginMarkedContentProps', id: 'v1' },
          { str: 'Line cap style.', hasEOL: false },
          { type: 'endMarkedContent' },
        ],
      },
    ]);

    const elements = await extractSectionContent(doc, 1, 1);

    expect(elements).toEqual([
      {
        type: 'table',
        headers: ['Key', 'Type', 'Value'],
        rows: [
          ['LW', 'number', 'Line width.'],
          ['LC', 'integer', 'Line cap style.'],
        ],
      },
    ]);
  });

  it('skips Artifact elements', async () => {
    const doc = createMockDoc([
      {
        structTree: {
          role: 'Document',
          children: [
            { role: 'Artifact', children: [{ type: 'content', id: 'art0' }] },
            { role: 'P', children: [{ type: 'content', id: 'mc0' }] },
          ],
        },
        textItems: [
          { type: 'beginMarkedContentProps', id: 'art0' },
          { str: 'Page 42', hasEOL: false },
          { type: 'endMarkedContent' },
          { type: 'beginMarkedContentProps', id: 'mc0' },
          { str: 'Actual content', hasEOL: false },
          { type: 'endMarkedContent' },
        ],
      },
    ]);

    const elements = await extractSectionContent(doc, 1, 1);

    expect(elements).toHaveLength(1);
    expect(elements[0]).toEqual({ type: 'paragraph', text: 'Actual content' });
  });

  it('falls back to plain text when no struct tree', async () => {
    const doc = createMockDoc([
      {
        structTree: null,
        textItems: [
          { str: 'Plain text content', hasEOL: false },
          { str: ' here.', hasEOL: false },
        ],
      },
    ]);

    const elements = await extractSectionContent(doc, 1, 1);

    expect(elements).toEqual([{ type: 'paragraph', text: 'Plain text content here.' }]);
  });

  it('combines content across multiple pages', async () => {
    const doc = createMockDoc([
      {
        structTree: {
          role: 'Document',
          children: [{ role: 'P', children: [{ type: 'content', id: 'mc0' }] }],
        },
        textItems: [
          { type: 'beginMarkedContentProps', id: 'mc0' },
          { str: 'Page 1 content', hasEOL: false },
          { type: 'endMarkedContent' },
        ],
      },
      {
        structTree: {
          role: 'Document',
          children: [{ role: 'P', children: [{ type: 'content', id: 'mc0' }] }],
        },
        textItems: [
          { type: 'beginMarkedContentProps', id: 'mc0' },
          { str: 'Page 2 content', hasEOL: false },
          { type: 'endMarkedContent' },
        ],
      },
    ]);

    const elements = await extractSectionContent(doc, 1, 2);

    expect(elements).toHaveLength(2);
    expect((elements[0] as { text: string }).text).toBe('Page 1 content');
    expect((elements[1] as { text: string }).text).toBe('Page 2 content');
  });

  it('skips empty paragraphs', async () => {
    const doc = createMockDoc([
      {
        structTree: {
          role: 'Document',
          children: [
            { role: 'P', children: [{ type: 'content', id: 'mc0' }] },
            { role: 'P', children: [{ type: 'content', id: 'mc1' }] },
          ],
        },
        textItems: [
          { type: 'beginMarkedContentProps', id: 'mc0' },
          { str: '   ', hasEOL: false },
          { type: 'endMarkedContent' },
          { type: 'beginMarkedContentProps', id: 'mc1' },
          { str: 'Real content', hasEOL: false },
          { type: 'endMarkedContent' },
        ],
      },
    ]);

    const elements = await extractSectionContent(doc, 1, 1);

    expect(elements).toHaveLength(1);
    expect((elements[0] as { text: string }).text).toBe('Real content');
  });

  it('recurses into container elements (Sect, Div)', async () => {
    const doc = createMockDoc([
      {
        structTree: {
          role: 'Document',
          children: [
            {
              role: 'Sect',
              children: [
                {
                  role: 'Div',
                  children: [{ role: 'P', children: [{ type: 'content', id: 'mc0' }] }],
                },
              ],
            },
          ],
        },
        textItems: [
          { type: 'beginMarkedContentProps', id: 'mc0' },
          { str: 'Nested content', hasEOL: false },
          { type: 'endMarkedContent' },
        ],
      },
    ]);

    const elements = await extractSectionContent(doc, 1, 1);

    expect(elements).toEqual([{ type: 'paragraph', text: 'Nested content' }]);
  });
});

describe('trimAfterNextSectionStart (S-9)', () => {
  const heading = (text: string): ContentElement => ({ type: 'heading', level: 3, text });
  const para = (text: string): ContentElement => ({ type: 'paragraph', text });

  it('cuts at the next section’s heading', () => {
    const elements = [heading('1.1 First'), para('Mine.'), heading('1.2 Second'), para('Theirs.')];

    const trimmed = trimAfterNextSectionStart(elements, '1.2');

    expect(trimmed).toEqual([heading('1.1 First'), para('Mine.')]);
  });

  it('keeps everything when the heading is not found (mirror of the start-trim arm)', () => {
    const elements = [heading('1.1 First'), para('Mine.'), para('Also mine.')];

    expect(trimAfterNextSectionStart(elements, '1.2')).toEqual(elements);
  });

  it('cuts to empty when the next heading opens the content (heading at index 0)', () => {
    // Own heading missing, next section's heading first: trimToSectionStart keeps
    // everything for the next section (index 0 → no cut there), so this section must
    // keep nothing — `> 0` here would duplicate the whole block into both sections.
    const elements = [heading('1.2 Second'), para('All of this is 1.2’s.')];

    expect(trimAfterNextSectionStart(elements, '1.2')).toEqual([]);
  });

  it('does not cut at a prefix-sharing sibling ("1.2" must not match "1.2.1")', () => {
    const elements = [heading('1.1 First'), para('Mine.'), heading('1.2.1 Grandchild'), para('x')];

    // "1.2 " does not prefix "1.2.1 Grandchild" — no cut.
    expect(trimAfterNextSectionStart(elements, '1.2')).toEqual(elements);
  });

  // ---- SV-1: heading keys that the trailing-space rule silently missed ----

  it('matches a title-key heading exactly (Annex subsections: "A.1 General")', () => {
    // Annex subsections carry no section number in the outline, so the key is the full
    // title and the heading text equals it — no trailing space to match on. Missing it
    // left the shared page double-held by parent and child (51 sections).
    const elements = [
      heading('Annex A\n(informative)\nOperator Summary'),
      para('Intro.'),
      heading('A.1 General'),
      para('Body.'),
    ];

    expect(trimAfterNextSectionStart(elements, 'A.1 General')).toEqual([
      heading('Annex A\n(informative)\nOperator Summary'),
      para('Intro.'),
    ]);
  });

  it('matches a heading whose key is followed by a line break ("Annex A\\n(informative)…")', () => {
    const elements = [
      para('Tail of previous.'),
      heading('Annex A\n(informative)\nOperator Summary'),
    ];

    expect(trimAfterNextSectionStart(elements, 'Annex A')).toEqual([para('Tail of previous.')]);
  });
});

describe('extractPageSegments (S-8)', () => {
  /** Compact page builder: `{ h }` becomes a heading, `{ p }` a paragraph. */
  function pageOf(...parts: Array<{ h?: string; p?: string }>): MockPageData {
    const children: MockStructTreeNode[] = [];
    const textItems: MockTextItem[] = [];
    parts.forEach((part, i) => {
      const id = `seg${i}`;
      children.push({
        role: part.h !== undefined ? 'H3' : 'P',
        children: [{ type: 'content', id }],
      });
      textItems.push({ type: 'beginMarkedContentProps', id });
      textItems.push({ str: part.h ?? part.p ?? '', hasEOL: false });
      textItems.push({ type: 'endMarkedContent' });
    });
    return { structTree: { role: 'Document', children }, textItems };
  }

  it('cuts the strip above the heading and gives it a null owner', async () => {
    // The QuadPoints shape: the tail of 12.5.6.10's table sits above 12.5.6.11's heading.
    const doc = createMockDoc([
      pageOf(
        { p: 'QuadPoints shall be an array of 8 x n numbers.' },
        { h: '1.2 Caret annotations' },
        { p: 'A caret annotation is a visual symbol.' },
      ),
    ]);

    const segments = await extractPageSegments(doc, 1, ['1.2']);

    expect(segments).toHaveLength(2);
    expect(segments[0].section).toBeNull();
    expect(segments[0].text).toContain('QuadPoints');
    expect(segments[0].text).not.toContain('caret annotation');
    expect(segments[1].section).toBe('1.2');
    expect(segments[1].text).toContain('caret annotation');
    expect(segments[1].text).not.toContain('QuadPoints');
  });

  it('emits no strip when the heading opens the page', async () => {
    const doc = createMockDoc([pageOf({ h: '1.2 Second' }, { p: 'Body text.' })]);

    const segments = await extractPageSegments(doc, 1, ['1.2']);

    expect(segments).toHaveLength(1);
    expect(segments[0].section).toBe('1.2');
  });

  it('gives the whole page to the section when its heading is not found', async () => {
    // Mirrors trimToSectionStart: heading missing → the section keeps the entire page,
    // and the previous owner adopts nothing (69 sections of ISO 32000-2).
    const doc = createMockDoc([
      pageOf({ p: 'Tail of the previous section.' }, { p: 'More text without a heading.' }),
    ]);

    const segments = await extractPageSegments(doc, 1, ['1.2']);

    expect(segments).toHaveLength(1);
    expect(segments[0].section).toBe('1.2');
    expect(segments[0].text).toContain('Tail of the previous section.');
  });

  it('cuts once per section when several start on the same page', async () => {
    const doc = createMockDoc([
      pageOf(
        { p: 'Strip from before.' },
        { h: '1.2 Second' },
        { p: 'Second body.' },
        { h: '1.3 Third' },
        { p: 'Third body.' },
      ),
    ]);

    const segments = await extractPageSegments(doc, 1, ['1.2', '1.3']);

    expect(segments.map((s) => s.section)).toEqual([null, '1.2', '1.3']);
    expect(segments[1].text).toContain('Second body.');
    expect(segments[1].text).not.toContain('Third body.');
    expect(segments[2].text).toContain('Third body.');
  });
});

/**
 * The tag shape of the Adobe-published ISO 32000-1 (PDF32000_2008.pdf), Issues #15 / #16:
 * no H element anywhere, a whole page nested as Sect > P > P > …, headings as leaf Ps,
 * the first body paragraph as a bare Span beside them, and tables as P > Span > Table
 * with the caption inside the Table.
 */
describe('nested-P pages (ISO 32000-1 tag shape, #15 / #16)', () => {
  const leafP = (id: string): MockStructTreeNode => ({
    role: 'P',
    children: [{ role: 'Span', children: [{ type: 'content', id }] }],
  });
  const mc = (id: string, str: string): MockTextItem[] => [
    { type: 'beginMarkedContentProps', id },
    { str, hasEOL: true },
    { type: 'endMarkedContent' },
  ];

  /** Page 266 of PDF32000_2008.pdf, reduced to one element per kind. */
  function page266(): MockPageData {
    return {
      structTree: {
        role: 'Sect',
        children: [
          {
            role: 'P',
            children: [
              {
                role: 'P',
                children: [
                  { role: 'P', children: [leafP('n4')] },
                  leafP('h964'),
                  leafP('p964'),
                  leafP('h965'),
                  {
                    role: 'P',
                    children: [
                      { role: 'Span', children: [{ type: 'content', id: 'p965' }] },
                      leafP('n965'),
                    ],
                  },
                  {
                    role: 'P',
                    children: [
                      {
                        role: 'Span',
                        children: [
                          {
                            role: 'Table',
                            children: [
                              { role: 'Caption', children: [leafP('cap')] },
                              {
                                role: 'THead',
                                children: [
                                  {
                                    role: 'TR',
                                    children: [
                                      { role: 'TH', children: [leafP('th1')] },
                                      { role: 'TH', children: [leafP('th2')] },
                                    ],
                                  },
                                ],
                              },
                              {
                                role: 'TBody',
                                children: [
                                  {
                                    role: 'TR',
                                    children: [
                                      { role: 'TD', children: [leafP('td1')] },
                                      { role: 'TD', children: [leafP('td2')] },
                                    ],
                                  },
                                ],
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      textItems: [
        ...mc('n4', 'NOTE 4 For CJK fonts, the host font name is often encoded.'),
        ...mc('h964', '9.6.4 Font Subsets'),
        ...mc('p964', 'PDF documents may include subsets of Type 1 and TrueType fonts.'),
        ...mc('h965', '9.6.5 Type 3 Fonts'),
        ...mc('p965', 'Type 3 fonts differ from the other fonts supported by PDF.'),
        ...mc('n965', 'NOTE 1 Type 3 fonts are more flexible than Type 1 fonts.'),
        ...mc('cap', 'Table 112 – Entries in a Type 3 font dictionary'),
        ...mc('th1', 'Key'),
        ...mc('th2', 'Type'),
        ...mc('td1', 'Type'),
        ...mc('td2', 'name'),
      ],
    };
  }

  const hints = new Map([
    ['9.6.3', 'TrueType Fonts'],
    ['9.6.4', 'Font Subsets'],
    ['9.6.5', 'Type 3 Fonts'],
  ]);

  it('without hints, the page is still one element per block — not one per page', async () => {
    // The container rule alone stops the page from melting into a single element.
    const elements = await extractSectionContent(createMockDoc([page266()]), 1, 1);

    expect(elements.map((e) => e.type)).toEqual([
      'note',
      'paragraph', // "9.6.4 Font Subsets" — a paragraph, since nothing says it is a heading
      'paragraph',
      'paragraph',
      'paragraph',
      'note',
      'paragraph', // caption, emitted before the table for table-collector
      'table',
    ]);
  });

  it('promotes a leaf P that matches an outline entry to a heading', async () => {
    const elements = await extractSectionContent(
      createMockDoc([page266()]),
      1,
      1,
      undefined,
      hints,
    );

    expect(elements.filter((e) => e.type === 'heading')).toEqual([
      { type: 'heading', level: 3, text: '9.6.4 Font Subsets' },
      { type: 'heading', level: 3, text: '9.6.5 Type 3 Fonts' },
    ]);
  });

  it('keeps the bare Span beside block children as a paragraph of its own', async () => {
    const elements = await extractSectionContent(
      createMockDoc([page266()]),
      1,
      1,
      undefined,
      hints,
    );

    expect(elements).toContainEqual({
      type: 'paragraph',
      text: 'Type 3 fonts differ from the other fonts supported by PDF.',
    });
  });

  it('surfaces a Table nested under P > Span, with its in-table Caption as the preceding paragraph', async () => {
    const elements = await extractSectionContent(
      createMockDoc([page266()]),
      1,
      1,
      undefined,
      hints,
    );

    const tableIdx = elements.findIndex((e) => e.type === 'table');
    expect(tableIdx).toBeGreaterThan(0);
    expect(elements[tableIdx]).toEqual({
      type: 'table',
      headers: ['Key', 'Type'],
      rows: [['Type', 'name']],
    });
    expect(elements[tableIdx - 1]).toEqual({
      type: 'paragraph',
      text: 'Table 112 – Entries in a Type 3 font dictionary',
    });
  });

  it('cuts the section at the promoted headings (9.6.4 keeps neither 9.6.3’s NOTE nor 9.6.5)', async () => {
    const elements = await extractSectionContent(createMockDoc([page266()]), 1, 1, '9.6.4', hints);

    // Start trim: 9.6.3's NOTE is gone. (The end trim is pdf-service's, mirrored below.)
    expect(elements[0]).toEqual({ type: 'heading', level: 3, text: '9.6.4 Font Subsets' });

    const trimmed = trimAfterNextSectionStart(elements, '9.6.5');
    expect(trimmed).toEqual([
      { type: 'heading', level: 3, text: '9.6.4 Font Subsets' },
      {
        type: 'paragraph',
        text: 'PDF documents may include subsets of Type 1 and TrueType fonts.',
      },
    ]);
  });

  it('splits the search segments at the promoted headings', async () => {
    const segments = await extractPageSegments(
      createMockDoc([page266()]),
      1,
      ['9.6.4', '9.6.5'],
      hints,
    );

    expect(segments.map((s) => s.section)).toEqual([null, '9.6.4', '9.6.5']);
    expect(segments[1].text).toContain('subsets of Type 1');
    expect(segments[1].text).not.toContain('Type 3 fonts differ');
    expect(segments[2].text).toContain('Type 3 fonts differ');
  });

  it('does not promote a paragraph that merely starts with a section number', async () => {
    const doc = createMockDoc([
      {
        structTree: { role: 'Sect', children: [leafP('p')] },
        textItems: mc('p', '9.6.4 is referenced by 9.8, "Font Descriptors", for subset tags.'),
      },
    ]);

    const elements = await extractSectionContent(doc, 1, 1, undefined, hints);

    expect(elements).toEqual([
      {
        type: 'paragraph',
        text: '9.6.4 is referenced by 9.8, "Font Descriptors", for subset tags.',
      },
    ]);
  });

  it('matches Annex headings across line breaks and the (normative) marker', async () => {
    const annexHints = new Map([
      ['Annex C', 'Implementation Limits'],
      ['C.1 General', 'C.1 General'],
    ]);
    const doc = createMockDoc([
      {
        structTree: { role: 'Sect', children: [leafP('a'), leafP('b')] },
        textItems: [
          { type: 'beginMarkedContentProps', id: 'a' },
          { str: 'Annex C', hasEOL: true },
          { str: '(normative)', hasEOL: true },
          { str: 'Implementation Limits', hasEOL: true },
          { type: 'endMarkedContent' },
          ...mc('b', 'C.1 General'),
        ],
      },
    ]);

    const elements = await extractSectionContent(doc, 1, 1, undefined, annexHints);

    expect(elements).toEqual([
      { type: 'heading', level: 1, text: 'Annex C\n(normative)\nImplementation Limits' },
      { type: 'heading', level: 2, text: 'C.1 General' },
    ]);
  });
});
