/**
 * 仕様書の見つけ方と鮮度（spec-sources。Issue #29・#30）
 *
 * MCP のホストは会話の間ずっと同じサーバーのプロセスを使う。起動している間に
 * PDF_SPEC_DIR の中身が変わっても、失敗や古い内容を覚えたまま答えると、利用者が
 * PDF を直しても・差し替えても・足しても、起動し直すまで結果が変わらない。
 *
 * 登録簿（RegistryService）は一時フォルダーの空のファイルで測る（ファイル名で仕様を
 * 見分けるだけで、PDF は開かない）。索引（PDFSpecService）は登録簿と読み込みを
 * 差し替えて測る。
 */

import { mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OutlineEntry } from '../types/index.js';
import { NullIndexStore } from './index-store.js';
import type { PDFDocumentProxy } from './pdf-loader.js';
import { RegistryService } from './pdf-registry.js';
import { PDFSpecService } from './pdf-service.js';

/** n ページの、構造木を持たない偽の文書 */
function fakeDoc(numPages: number): PDFDocumentProxy {
  return { numPages, getPage: vi.fn(), destroy: vi.fn() } as unknown as PDFDocumentProxy;
}

const OUTLINE: OutlineEntry[] = [
  { title: '1 Scope', page: 1, children: [], sectionNumber: '1' } as unknown as OutlineEntry,
];

/** 指紋（getSpecVersion）を外から変えられる偽の登録簿 */
function fakeRegistry() {
  const state = { version: 'v1' };
  return {
    state,
    getSpecPath: () => '/fake/spec.pdf',
    resolveSpecId: (id?: string) => id ?? 'test-spec',
    enrichSpecInfo: () => {},
    getSpecVersion: () => state.version,
  };
}

describe('SPEC-PDFSPEC-SPEC-SOURCES-001 仕様書の読み込みや索引作りに失敗した結果を覚えない', () => {
  it('SPEC-PDFSPEC-SPEC-SOURCES-001 節の索引を作るのに失敗した後で PDF を直すと、次の呼び出しで作り直す', async () => {
    let broken = true;
    const loader = {
      loadDocument: vi.fn(async () => {
        if (broken) throw new Error('Invalid PDF structure.');
        return fakeDoc(1);
      }),
      reloadDocument: vi.fn(async () => fakeDoc(1)),
      getOutlineWithPages: async () => OUTLINE,
      evictDocument: vi.fn(),
    };
    const service = new PDFSpecService(fakeRegistry(), loader, new NullIndexStore());

    await expect(service.getSectionIndex('test-spec')).rejects.toThrow('Invalid PDF structure.');
    broken = false;
    const index = await service.getSectionIndex('test-spec');
    expect(index.totalPages).toBe(1);
    expect(loader.loadDocument).toHaveBeenCalledTimes(2);
  });

  describe('登録簿の走査', () => {
    let root: string;
    let saved: string | undefined;
    beforeEach(async () => {
      root = await mkdtemp(join(tmpdir(), 'spec-sources-'));
      saved = process.env.PDF_SPEC_DIR;
    });
    afterEach(async () => {
      if (saved === undefined) delete process.env.PDF_SPEC_DIR;
      else process.env.PDF_SPEC_DIR = saved;
      await rm(root, { recursive: true, force: true });
    });

    it('SPEC-PDFSPEC-SPEC-SOURCES-001 PDF_SPEC_DIR の走査に失敗した後でフォルダーを作ると、次の呼び出しで読む', async () => {
      const dir = join(root, 'not-yet');
      process.env.PDF_SPEC_DIR = dir;
      const registry = new RegistryService();

      await expect(registry.ensureInitialized()).rejects.toThrow('Cannot read PDF_SPEC_DIR');
      const { mkdir } = await import('node:fs/promises');
      await mkdir(dir);
      await writeFile(join(dir, 'ISO_TS_32001-2022.pdf'), 'x');
      await registry.ensureInitialized();
      expect(registry.isSpecAvailable('ts32001')).toBe(true);
    });
  });
});

describe('SPEC-PDFSPEC-SPEC-SOURCES-002 差し替えた仕様書を、次の呼び出しで差し替えた後の内容から読む', () => {
  it('SPEC-PDFSPEC-SPEC-SOURCES-002 仕様書を差し替えると、次の呼び出しで差し替えた後の内容から答える', async () => {
    const registry = fakeRegistry();
    let pages = 1;
    const loader = {
      loadDocument: vi.fn(async () => fakeDoc(pages)),
      reloadDocument: vi.fn(async () => fakeDoc(pages)),
      getOutlineWithPages: async () => OUTLINE,
      evictDocument: vi.fn(),
    };
    const service = new PDFSpecService(registry, loader, new NullIndexStore());

    expect((await service.getSectionIndex('test-spec')).totalPages).toBe(1);
    pages = 3;
    registry.state.version = 'v2';
    expect((await service.getSectionIndex('test-spec')).totalPages).toBe(3);
    expect(loader.evictDocument).toHaveBeenCalledWith('/fake/spec.pdf');
  });

  it('SPEC-PDFSPEC-SPEC-SOURCES-002 仕様書が変わらなければ、2 回目は読み直さない', async () => {
    const loader = {
      loadDocument: vi.fn(async () => fakeDoc(1)),
      reloadDocument: vi.fn(async () => fakeDoc(1)),
      getOutlineWithPages: async () => OUTLINE,
      evictDocument: vi.fn(),
    };
    const service = new PDFSpecService(fakeRegistry(), loader, new NullIndexStore());

    const a = await service.getSectionIndex('test-spec');
    const b = await service.getSectionIndex('test-spec');
    expect(b).toBe(a);
    expect(loader.loadDocument).toHaveBeenCalledTimes(1);
    expect(loader.evictDocument).not.toHaveBeenCalled();
  });

  describe('登録簿の指紋', () => {
    let dir: string;
    let saved: string | undefined;
    beforeEach(async () => {
      dir = await mkdtemp(join(tmpdir(), 'spec-sources-'));
      saved = process.env.PDF_SPEC_DIR;
      process.env.PDF_SPEC_DIR = dir;
    });
    afterEach(async () => {
      if (saved === undefined) delete process.env.PDF_SPEC_DIR;
      else process.env.PDF_SPEC_DIR = saved;
      await rm(dir, { recursive: true, force: true });
    });

    it('SPEC-PDFSPEC-SPEC-SOURCES-002 仕様書を差し替えると、次の呼び出しで差し替えた後の内容から答える（登録簿の指紋が変わる）', async () => {
      const file = join(dir, 'ISO_TS_32001-2022.pdf');
      await writeFile(file, 'one page');
      const registry = new RegistryService();
      await registry.ensureInitialized();
      const before = registry.getSpecVersion('ts32001');
      expect(before).toBeDefined();

      await writeFile(file, 'three pages, a different size');
      await registry.ensureInitialized();
      const after = registry.getSpecVersion('ts32001');
      expect(after).toBeDefined();
      expect(after).not.toBe(before);
    });
  });
});

describe('SPEC-PDFSPEC-SPEC-SOURCES-003 PDF_SPEC_DIR に足した・消した仕様書を、次の呼び出しで見る', () => {
  let dir: string;
  let saved: string | undefined;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'spec-sources-'));
    saved = process.env.PDF_SPEC_DIR;
    process.env.PDF_SPEC_DIR = dir;
  });
  afterEach(async () => {
    if (saved === undefined) delete process.env.PDF_SPEC_DIR;
    else process.env.PDF_SPEC_DIR = saved;
    await rm(dir, { recursive: true, force: true });
  });

  it('SPEC-PDFSPEC-SPEC-SOURCES-003 足した仕様書が、次の呼び出しで一覧に出て引ける', async () => {
    await writeFile(join(dir, 'ISO_TS_32001-2022.pdf'), 'x');
    const registry = new RegistryService();
    await registry.ensureInitialized();
    expect(registry.listSpecs().map((s) => s.id)).toEqual(['ts32001']);

    await writeFile(join(dir, 'ISO_TS_32002-2022.pdf'), 'x');
    await registry.ensureInitialized();
    expect(
      registry
        .listSpecs()
        .map((s) => s.id)
        .sort(),
    ).toEqual(['ts32001', 'ts32002']);
    expect(registry.getSpecPath('ts32002')).toBe(join(dir, 'ISO_TS_32002-2022.pdf'));
  });

  it('SPEC-PDFSPEC-SPEC-SOURCES-003 消した仕様書は、次の呼び出しで一覧から消える', async () => {
    await writeFile(join(dir, 'ISO_TS_32001-2022.pdf'), 'x');
    await writeFile(join(dir, 'ISO_TS_32002-2022.pdf'), 'x');
    const registry = new RegistryService();
    await registry.ensureInitialized();
    expect(registry.isSpecAvailable('ts32002')).toBe(true);

    await unlink(join(dir, 'ISO_TS_32002-2022.pdf'));
    await registry.ensureInitialized();
    expect(registry.listSpecs().map((s) => s.id)).toEqual(['ts32001']);
    expect(() => registry.getSpecPath('ts32002')).toThrow('not found');
  });
});
