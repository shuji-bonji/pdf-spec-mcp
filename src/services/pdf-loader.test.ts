/**
 * pdf-loader.ts unit tests
 * Tests parseSectionNumber() and the LRU document cache.
 */

import { describe, expect, it, vi } from 'vitest';
import type { PDFDocumentProxy } from 'pdfjs-dist/types/src/display/api.js';
import { DocumentLoaderService, parseSectionNumber } from './pdf-loader.js';

describe('parseSectionNumber', () => {
  describe('standard numeric sections', () => {
    it('should parse single-level section: "7 Syntax"', () => {
      expect(parseSectionNumber('7 Syntax')).toBe('7');
    });

    it('should parse two-level section: "7.3 Objects"', () => {
      expect(parseSectionNumber('7.3 Objects')).toBe('7.3');
    });

    it('should parse deep section: "7.3.4.1 Name objects"', () => {
      expect(parseSectionNumber('7.3.4.1 Name objects')).toBe('7.3.4.1');
    });

    it('should parse section with tab separator: "7.3.4\tString objects"', () => {
      expect(parseSectionNumber('7.3.4\tString objects')).toBe('7.3.4');
    });
  });

  describe('dot-terminated numeric (WTPDF format)', () => {
    it('should parse "1. Introduction" → "1"', () => {
      expect(parseSectionNumber('1. Introduction')).toBe('1');
    });

    it('should parse "5. Notation & Terminology" → "5"', () => {
      expect(parseSectionNumber('5. Notation & Terminology')).toBe('5');
    });

    it('should NOT match standard subsection "4.1 artifact" (no trailing dot)', () => {
      expect(parseSectionNumber('4.1 artifact marked content sequence')).toBe('4.1');
    });
  });

  describe('Annex sections', () => {
    it('should parse "Annex A (normative) Operator summary"', () => {
      expect(parseSectionNumber('Annex A (normative) Operator summary')).toBe('Annex A');
    });

    it('should parse "Annex A" alone', () => {
      expect(parseSectionNumber('Annex A ')).toBe('Annex A');
    });

    it('should parse Annex subsection: "Annex A.1 Description"', () => {
      expect(parseSectionNumber('Annex A.1 Description')).toBe('Annex A.1');
    });
  });

  describe('Appendix sections (WTPDF/PDF Association)', () => {
    it('should parse "Appendix A: Example PDF Declaration"', () => {
      expect(parseSectionNumber('Appendix A: Example PDF Declaration')).toBe('Appendix A');
    });

    it('should normalize case: "appendix B" → "Appendix B"', () => {
      expect(parseSectionNumber('appendix B something')).toBe('Appendix B');
    });
  });

  describe('zero-width space handling', () => {
    it('should strip zero-width spaces: "1 \\u200BScope "', () => {
      expect(parseSectionNumber('1 \u200BScope ')).toBe('1');
    });

    it('should strip FEFF BOM: "\\uFEFF7.3 Objects"', () => {
      expect(parseSectionNumber('\uFEFF7.3 Objects')).toBe('7.3');
    });
  });

  describe('non-matching titles', () => {
    it('should return null for "Foreword"', () => {
      expect(parseSectionNumber('Foreword')).toBeNull();
    });

    it('should return null for "Introduction"', () => {
      expect(parseSectionNumber('Introduction')).toBeNull();
    });

    it('should return null for "Bibliography"', () => {
      expect(parseSectionNumber('Bibliography')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(parseSectionNumber('')).toBeNull();
    });
  });
});

/**
 * LRU document cache.
 *
 * This cache exists to bound memory: at most `maxCachedDocs` PDFDocumentProxy instances
 * are held, and evicted ones are released with `doc.destroy()`. Both halves matter — an
 * eviction that forgets to destroy leaks, and a wrong eviction order thrashes.
 *
 * The e2e tests X-1〜X-3 ("LRU ドキュメントキャッシュ") do not actually reach this code:
 * they drive `get_structure`, which memoises its section index per spec in an unbounded
 * Map, so every call after the first returns without touching the loader at all. Those
 * tests pass whether or not this cache works. These do not.
 */
describe('DocumentLoaderService — LRU document cache', () => {
  /** A stand-in document; only `destroy` and `numPages` are exercised here. */
  function fakeDoc(): PDFDocumentProxy {
    return { numPages: 1, destroy: vi.fn() } as unknown as PDFDocumentProxy;
  }

  /**
   * Was this exact instance released?
   *
   * Asserted against the object the loader handed back, not against a path: reloading
   * puts a second instance behind the same path, and the whole point of that test is
   * that the *first* one got destroyed.
   */
  function wasDestroyed(doc: PDFDocumentProxy): boolean {
    return vi.mocked(doc.destroy).mock.calls.length > 0;
  }

  /** Loader wired to an in-memory source, so no file or pdfjs is involved. */
  function createLoader(maxCachedDocs: number) {
    const source = vi.fn(async (_path: string) => fakeDoc());
    const loader = new DocumentLoaderService(maxCachedDocs, source);
    /** Paths actually opened, in order — a cache hit must not appear here. */
    const opened = () => source.mock.calls.map(([p]) => p);
    return { loader, opened, source };
  }

  it('serves a cached document without reopening it', async () => {
    const { loader, opened } = createLoader(4);

    const first = await loader.loadDocument('/a.pdf');
    const second = await loader.loadDocument('/a.pdf');

    expect(second).toBe(first);
    expect(opened()).toEqual(['/a.pdf']);
  });

  it('evicts the least recently used document once full, and destroys it', async () => {
    const { loader, opened } = createLoader(2);

    const a = await loader.loadDocument('/a.pdf');
    const b = await loader.loadDocument('/b.pdf');
    await loader.loadDocument('/c.pdf'); // full → /a.pdf is the oldest

    expect(loader.cacheSize).toBe(2);
    expect(wasDestroyed(a)).toBe(true);
    expect(wasDestroyed(b)).toBe(false);

    // /a.pdf is gone, so it must be reopened; /b.pdf is still cached.
    await loader.loadDocument('/b.pdf');
    await loader.loadDocument('/a.pdf');
    expect(opened()).toEqual(['/a.pdf', '/b.pdf', '/c.pdf', '/a.pdf']);
  });

  it('a cache hit refreshes access order, sparing that document from eviction', async () => {
    // The claim X-3 makes but never checks. Without the refresh in loadDocument(),
    // /a.pdf would be evicted here instead of /b.pdf.
    const { loader } = createLoader(2);

    const a = await loader.loadDocument('/a.pdf');
    const b = await loader.loadDocument('/b.pdf');
    await loader.loadDocument('/a.pdf'); // hit → /a.pdf becomes most recently used
    await loader.loadDocument('/c.pdf'); // evicts the oldest, now /b.pdf

    expect(wasDestroyed(b)).toBe(true);
    expect(wasDestroyed(a)).toBe(false);
  });

  it('reloadDocument destroys the cached instance and opens a fresh one', async () => {
    // Force-reload resets pdfjs' PagesMapper singleton (see reloadDocument's comment).
    // What must hold: the superseded instance is released, and the fresh one is cached.
    //
    // Not asserted: that reload also removes the path from `accessOrder`. It does, but
    // skipping it turns out to be harmless — a stale entry hits the `if (doc)` guard in
    // loadDocumentFresh and is simply consumed, so no reachable behaviour changes.
    // (Verified by mutation: deleting that splice fails no test here, by design.)
    const { loader, opened } = createLoader(2);

    const first = await loader.loadDocument('/a.pdf');
    const reloaded = await loader.reloadDocument('/a.pdf');

    expect(reloaded).not.toBe(first);
    expect(wasDestroyed(first)).toBe(true);
    expect(wasDestroyed(reloaded)).toBe(false);
    expect(opened()).toEqual(['/a.pdf', '/a.pdf']);
    expect(loader.cacheSize).toBe(1);

    // The reloaded instance is the live one: a later load must not disturb it.
    await loader.loadDocument('/b.pdf');
    expect(loader.cacheSize).toBe(2);
    expect(wasDestroyed(reloaded)).toBe(false);
  });

  it('reloadDocument works for a path that was never cached', async () => {
    const { loader, opened } = createLoader(2);

    await loader.reloadDocument('/a.pdf');

    expect(loader.cacheSize).toBe(1);
    expect(opened()).toEqual(['/a.pdf']);
  });

  it('clearCache destroys every cached document', async () => {
    const { loader } = createLoader(4);

    const a = await loader.loadDocument('/a.pdf');
    const b = await loader.loadDocument('/b.pdf');
    loader.clearCache();

    expect(loader.cacheSize).toBe(0);
    expect(wasDestroyed(a)).toBe(true);
    expect(wasDestroyed(b)).toBe(true);

    // Access order must be cleared too, or the next eviction would target a stale path.
    await loader.loadDocument('/c.pdf');
    expect(loader.cacheSize).toBe(1);
  });

  it('holds no more than maxCachedDocs documents', async () => {
    const { loader } = createLoader(4);

    for (const p of ['/a.pdf', '/b.pdf', '/c.pdf', '/d.pdf', '/e.pdf', '/f.pdf']) {
      await loader.loadDocument(p);
    }

    expect(loader.cacheSize).toBe(4);
  });
});
