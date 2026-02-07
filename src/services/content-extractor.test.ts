import { describe, it, expect, vi } from 'vitest';
import { extractSectionContent } from './content-extractor.js';

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
