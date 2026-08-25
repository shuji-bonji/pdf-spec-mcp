/**
 * 12 - On-disk index store E2E (Issue #6)
 *
 * C-1 〜 C-6: 実 PDF で、構築 → 別インスタンスで読込 → 同一性、無効化、破損、冪等性、CLI。
 *
 * setup.ts が既定の store を PDF_SPEC_CACHE=off にしているので、ここでは一時ディレクトリを
 * 向けた FileIndexStore を明示的に PDFSpecService へ注入する。toolHandlers は使わない
 * （あちらは既定の store を通り、キャッシュ無効のまま動く）。
 */
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runCli } from '../../src/cli.js';
import { INDEX_SCHEMA_VERSION, PACKAGE_INFO } from '../../src/config.js';
import { FileIndexStore, type IndexStore } from '../../src/services/index-store.js';
import {
  getOutlineWithPages,
  loadDocument,
  reloadDocument,
} from '../../src/services/pdf-loader.js';
import { enrichSpecInfo, getSpecPath, resolveSpecId } from '../../src/services/pdf-registry.js';
import { PDFSpecService } from '../../src/services/pdf-service.js';
import { withTiming } from './helpers.js';
import { HAS_PDFS, initRegistry } from './setup.js';

/** A fresh service over the real registry / loader, with an explicit store. */
const freshService = (store: IndexStore) =>
  new PDFSpecService(
    { getSpecPath, resolveSpecId, enrichSpecInfo },
    { loadDocument, reloadDocument, getOutlineWithPages },
    store,
  );

const QUERIES = ['digital signature', 'cross-reference', 'shall not', 'Highlight', 'MCID'];

describe.skipIf(!HAS_PDFS)('12 - index store', () => {
  let dir: string;
  let store: FileIndexStore;

  beforeAll(async () => {
    await initRegistry();
    dir = await mkdtemp(join(tmpdir(), 'pdf-spec-e2e-cache-'));
    store = new FileIndexStore({ dir, enabled: true });
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  // 小さい仕様（49 ページ）で形と往復を確かめ、大きい仕様（1023 ページ）で時間を測る。
  describe('ts32005 (small): the round trip', () => {
    let cold: { hits: unknown[]; requirements: unknown; search: number; req: number };

    it('C-1: a cold build writes one file per kind under the documented path', async () => {
      const svc = freshService(store);
      const s = await withTiming(() => svc.searchSpec('namespace', 10, 'ts32005'));
      const r = await withTiming(() => svc.getRequirements(undefined, undefined, 'ts32005'));
      cold = { hits: s.result, requirements: r.result, search: s.durationMs, req: r.durationMs };

      const entries = await store.entries();
      const rel = entries.map((e) => e.relative);
      expect(rel.length).toBe(2);
      for (const kind of ['search', 'requirements']) {
        expect(
          rel.some((p) =>
            new RegExp(
              `^v${INDEX_SCHEMA_VERSION}/${PACKAGE_INFO.version.replace(/\./g, '\\.')}/ts32005\\.${kind}\\.[0-9a-f]{16}\\.json$`,
            ).test(p),
          ),
        ).toBe(true);
      }
    });

    it('C-2: a second service reads the same index and gives the same answers', async () => {
      const svc = freshService(store);
      const hits = await svc.searchSpec('namespace', 10, 'ts32005');
      const requirements = await svc.getRequirements(undefined, undefined, 'ts32005');
      expect(hits).toEqual(cold.hits);
      expect(requirements).toEqual(cold.requirements);

      // Not just the answers: the index itself is byte-for-byte what was built.
      const pdfPath = getSpecPath('ts32005');
      const loaded = await store.load('search', 'ts32005', pdfPath);
      expect(loaded).not.toBeNull();
      const rebuilt = freshService(new FileIndexStore({ dir: join(dir, 'other'), enabled: true }));
      await rebuilt.searchSpec('namespace', 10, 'ts32005');
      const other = await new FileIndexStore({ dir: join(dir, 'other'), enabled: true }).load(
        'search',
        'ts32005',
        pdfPath,
      );
      expect(other?.data).toEqual(loaded?.data);
    });

    it('C-4: a file written by another version is rebuilt, and the rebuilt file replaces it', async () => {
      const pdfPath = getSpecPath('ts32005');
      const loaded = await store.load('requirements', 'ts32005', pdfPath);
      if (!loaded) throw new Error('fixture: requirements index missing');
      const file = JSON.parse(await readFile(loaded.path, 'utf8'));
      file.meta.packageVersion = '0.0.0-stale';
      await writeFile(loaded.path, JSON.stringify(file));
      expect(await store.load('requirements', 'ts32005', pdfPath)).toBeNull();

      const before = (await stat(loaded.path)).mtimeMs;
      const svc = freshService(store);
      const requirements = await svc.getRequirements(undefined, undefined, 'ts32005');
      expect(requirements).toEqual(cold.requirements);

      const again = await store.load('requirements', 'ts32005', pdfPath);
      expect(again?.meta.packageVersion).toBe(PACKAGE_INFO.version);
      expect((await stat(loaded.path)).mtimeMs).toBeGreaterThanOrEqual(before);
    });

    it('C-4b: a truncated file is rebuilt without an error reaching the caller', async () => {
      const pdfPath = getSpecPath('ts32005');
      const loaded = await store.load('search', 'ts32005', pdfPath);
      if (!loaded) throw new Error('fixture: search index missing');
      const raw = await readFile(loaded.path, 'utf8');
      await writeFile(loaded.path, raw.slice(0, Math.floor(raw.length / 2)));

      const svc = freshService(store);
      expect(await svc.searchSpec('namespace', 10, 'ts32005')).toEqual(cold.hits);
      expect((await store.load('search', 'ts32005', pdfPath))?.data.pages.length).toBeGreaterThan(
        0,
      );
    });

    it('C-5: with the cache on, order and repetition do not change any answer', async () => {
      const a = freshService(store);
      const b = freshService(store);
      const run = async (svc: PDFSpecService) => ({
        req: JSON.stringify(await svc.getRequirements(undefined, undefined, 'ts32005')),
        hit1: JSON.stringify(await svc.searchSpec('namespace', 10, 'ts32005')),
        req2: JSON.stringify(await svc.getRequirements(undefined, undefined, 'ts32005')),
        tables: JSON.stringify(await svc.getTables('5', undefined, 'ts32005')),
        hit2: JSON.stringify(await svc.searchSpec('namespace', 10, 'ts32005')),
        reqSec: JSON.stringify(await svc.getRequirements('5', undefined, 'ts32005')),
      });
      // b: reversed order, and mutate what a returned in between.
      const ra = await run(a);
      const hits = await a.searchSpec('namespace', 10, 'ts32005');
      hits.splice(0, hits.length);
      const reqs = await a.getRequirements(undefined, undefined, 'ts32005');
      reqs.requirements.length = 0;
      const rb = {
        reqSec: JSON.stringify(await b.getRequirements('5', undefined, 'ts32005')),
        hit2: JSON.stringify(await b.searchSpec('namespace', 10, 'ts32005')),
        tables: JSON.stringify(await b.getTables('5', undefined, 'ts32005')),
        req2: JSON.stringify(await b.getRequirements(undefined, undefined, 'ts32005')),
        hit1: JSON.stringify(await b.searchSpec('namespace', 10, 'ts32005')),
        req: JSON.stringify(await b.getRequirements(undefined, undefined, 'ts32005')),
      };
      expect(ra.req).toBe(ra.req2);
      expect(ra.hit1).toBe(ra.hit2);
      expect(rb).toEqual(ra);
      expect(JSON.stringify(await a.searchSpec('namespace', 10, 'ts32005'))).toBe(ra.hit1);
    });
  });

  describe('iso32000-2 (1023 pages): what the cache is for', () => {
    let coldSearchMs: number;
    let coldReqMs: number;
    let coldHits: Record<string, unknown>;
    let coldReqCount: number;

    it('C-3a: cold build (search + full requirements scan)', async () => {
      const svc = freshService(store);
      const s = await withTiming(() => svc.searchSpec(QUERIES[0], 10, 'iso32000-2'));
      coldSearchMs = s.durationMs;
      coldHits = {};
      for (const q of QUERIES) coldHits[q] = await svc.searchSpec(q, 10, 'iso32000-2');
      const r = await withTiming(() => svc.getRequirements(undefined, undefined, 'iso32000-2'));
      coldReqMs = r.durationMs;
      coldReqCount = r.result.totalRequirements;
      expect(coldReqCount).toBeGreaterThan(5000);
    });

    it('C-3b: a second process-equivalent answers from disk, identically, at least 5× faster', async () => {
      const svc = freshService(store);
      const s = await withTiming(() => svc.searchSpec(QUERIES[0], 10, 'iso32000-2'));
      for (const q of QUERIES) {
        expect(await svc.searchSpec(q, 10, 'iso32000-2')).toEqual(coldHits[q]);
      }
      const r = await withTiming(() => svc.getRequirements(undefined, undefined, 'iso32000-2'));
      expect(r.result.totalRequirements).toBe(coldReqCount);

      // The warm search still opens the PDF once for the section index (get_structure-cold
      // is 139 ms on a laptop, ~400 ms in a 2-CPU sandbox); everything else is a JSON read.
      console.error(
        `[12] iso32000-2 search cold ${coldSearchMs}ms → warm ${s.durationMs}ms; ` +
          `requirements cold ${coldReqMs}ms → warm ${r.durationMs}ms`,
      );
      expect(s.durationMs).toBeLessThan(2000);
      expect(s.durationMs * 5).toBeLessThan(coldSearchMs);
      expect(r.durationMs * 5).toBeLessThan(coldReqMs);
    });
  });

  describe('CLI', () => {
    it('C-6: --build-cache writes every kind for the requested specs; the second run hits', async () => {
      const cliDir = join(dir, 'cli');
      const env = { ...process.env, PDF_SPEC_CACHE: 'on', PDF_SPEC_CACHE_DIR: cliDir };
      const lines: string[] = [];
      const code = await runCli(
        ['--build-cache', '--spec=ts32001,an001'],
        (l) => lines.push(l),
        env,
      );
      expect(code).toBe(0);
      expect(lines.filter((l) => l.includes(' built ')).length).toBe(2);
      const entries = await new FileIndexStore({ dir: cliDir, enabled: true }).entries();
      const prefix = `v${INDEX_SCHEMA_VERSION}/${PACKAGE_INFO.version}`;
      expect(entries.map((e) => e.relative.replace(/\.[0-9a-f]{16}\.json$/, '')).sort()).toEqual([
        `${prefix}/an001.requirements`,
        `${prefix}/an001.search`,
        `${prefix}/ts32001.requirements`,
        `${prefix}/ts32001.search`,
      ]);

      const again: string[] = [];
      expect(
        await runCli(['--build-cache', '--spec=ts32001,an001'], (l) => again.push(l), env),
      ).toBe(0);
      expect(again.filter((l) => l.includes(' hit ')).length).toBe(2);
      expect(again.some((l) => l.includes(' built '))).toBe(false);

      const info: string[] = [];
      expect(await runCli(['--cache-info'], (l) => info.push(l), env)).toBe(0);
      expect(info.some((l) => l.includes('4 file(s)'))).toBe(true);

      expect(await runCli(['--build-cache', '--spec=nope'], () => {}, env)).toBe(2);
      expect(await runCli(['--build-cache'], () => {}, { ...env, PDF_SPEC_CACHE: 'off' })).toBe(2);

      const cleared: string[] = [];
      expect(await runCli(['--clear-cache'], (l) => cleared.push(l), env)).toBe(0);
      await expect(stat(cliDir)).rejects.toThrow();
    });
  });
});
