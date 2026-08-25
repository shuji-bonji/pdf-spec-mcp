/**
 * FileIndexStore (Issue #6).
 *
 * The file being hashed only has to be a file — nothing here opens it as a PDF. Every test
 * builds its own store with explicit options, so nothing reads or writes the developer's
 * ~/.cache (vitest.config.ts additionally sets PDF_SPEC_CACHE=off for the default store).
 *
 * The property under test is the one the service relies on: a hit is returned only for
 * the same bytes indexed by the same code, and everything else — including every kind of
 * damage to the cache — is a miss that never throws.
 */

import { chmod, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { INDEX_SCHEMA_VERSION, PACKAGE_INFO, PDFJS_VERSION } from '../config.js';
import type { Requirement } from '../types/index.js';
import { sha256File } from '../utils/file-hash.js';
import { logger } from '../utils/logger.js';
import {
  FileIndexStore,
  type IndexPayload,
  type IndexVersions,
  isCacheEnabled,
  NullIndexStore,
  resolveCacheDir,
} from './index-store.js';

let root: string;
let pdfPath: string;

const searchData: IndexPayload['search'] = {
  pages: [
    { page: 1, section: '1', text: 'The reader shall accept.' },
    { page: 2, section: '1.1', text: 'cross-reference table' },
  ],
};

const requirementsData: Requirement[] = [
  { id: 'r1', level: 'shall', text: 'The reader shall accept.', section: '1', sectionTitle: 'One' },
];

const versions = (over: Partial<IndexVersions> = {}): IndexVersions => ({
  schema: INDEX_SCHEMA_VERSION,
  package: PACKAGE_INFO.version,
  pdfjs: PDFJS_VERSION,
  ...over,
});

const store = (options: ConstructorParameters<typeof FileIndexStore>[0] = {}) =>
  new FileIndexStore({ dir: join(root, 'cache'), enabled: true, ...options });

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'pdf-spec-index-store-'));
  pdfPath = join(root, 'spec.pdf');
  await writeFile(pdfPath, 'not really a pdf, but bytes are bytes');
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('resolution', () => {
  it('directory: explicit env > XDG_CACHE_HOME > ~/.cache', () => {
    expect(resolveCacheDir({ PDF_SPEC_CACHE_DIR: '/x' })).toBe('/x');
    expect(resolveCacheDir({ XDG_CACHE_HOME: '/y' })).toBe(join('/y', 'pdf-spec-mcp'));
    expect(resolveCacheDir({})).toMatch(/[/\\]\.cache[/\\]pdf-spec-mcp$/);
  });

  it('toggle: only off / 0 / false disable', () => {
    expect(isCacheEnabled({})).toBe(true);
    expect(isCacheEnabled({ PDF_SPEC_CACHE: 'on' })).toBe(true);
    expect(isCacheEnabled({ PDF_SPEC_CACHE: 'off' })).toBe(false);
    expect(isCacheEnabled({ PDF_SPEC_CACHE: 'OFF' })).toBe(false);
    expect(isCacheEnabled({ PDF_SPEC_CACHE: '0' })).toBe(false);
    expect(isCacheEnabled({ PDF_SPEC_CACHE: 'false' })).toBe(false);
  });

  it('settings are read on first use, not at construction', async () => {
    const env: NodeJS.ProcessEnv = {};
    const s = new FileIndexStore({ env });
    env.PDF_SPEC_CACHE_DIR = join(root, 'late');
    await s.save('search', 'spec', pdfPath, searchData, 1);
    expect((await readdir(join(root, 'late'))).length).toBe(1);
  });
});

describe('round trip and the key', () => {
  it('IS-1: save then load returns the same data, under the documented path', async () => {
    const s = store();
    const written = await s.save('search', 'iso32000-2', pdfPath, searchData, 1234);
    const digest = await sha256File(pdfPath);
    expect(written).toBe(
      join(
        root,
        'cache',
        `v${INDEX_SCHEMA_VERSION}`,
        PACKAGE_INFO.version,
        `iso32000-2.search.${digest.sha256.slice(0, 16)}.json`,
      ),
    );

    const loaded = await s.load('search', 'iso32000-2', pdfPath);
    expect(loaded?.data).toEqual(searchData);
    expect(loaded?.meta.buildTimeMs).toBe(1234);
    expect(loaded?.meta.fileSha256).toBe(digest.sha256);
    expect(loaded?.path).toBe(written);
  });

  it('IS-1b: the two kinds do not collide', async () => {
    const s = store();
    await s.save('search', 'spec', pdfPath, searchData, 1);
    await s.save('requirements', 'spec', pdfPath, requirementsData, 1);
    expect((await s.load('search', 'spec', pdfPath))?.data).toEqual(searchData);
    expect((await s.load('requirements', 'spec', pdfPath))?.data).toEqual(requirementsData);
  });

  it.each([
    ['IS-2 packageVersion', { package: '0.0.0-other' }],
    ['IS-3 pdfjsVersion', { pdfjs: '0.0.0-other' }],
    ['IS-4 schemaVersion', { schema: INDEX_SCHEMA_VERSION + 1 }],
  ])('%s: written by another version → miss', async (_name, other) => {
    await store({ versions: versions(other) }).save('search', 'spec', pdfPath, searchData, 1);
    // Same directory, current versions: the file is not under this version's path, but
    // even if it were, the meta would not match. Prove the second half by copying it over.
    const s = store();
    const digest = await sha256File(pdfPath);
    const theirs = store({ versions: versions(other) }).pathFor('search', 'spec', digest);
    const ours = s.pathFor('search', 'spec', digest);
    // For pdfjsVersion the two paths coincide (it is not in the path, only in the meta), so
    // the copy is a no-op and the meta check alone has to reject it.
    await mkdir(dirname(ours), { recursive: true });
    await writeFile(ours, await readFile(theirs));

    expect(await s.load('search', 'spec', pdfPath)).toBeNull();
  });

  it('IS-5: one changed byte in the PDF → miss, even within the same process', async () => {
    // The digest is memoised per (path, size, mtime), not per path: a replaced file is
    // re-hashed rather than served from the old key.
    const s = store();
    await s.save('search', 'spec', pdfPath, searchData, 1);
    await writeFile(pdfPath, 'not really a pdf, but bytes are bytes!');

    expect(await s.load('search', 'spec', pdfPath)).toBeNull();
  });

  it('IS-5b: same size, different bytes → miss (size alone is not the key)', async () => {
    const s = store();
    await s.save('search', 'spec', pdfPath, searchData, 1);
    const digest = await sha256File(pdfPath);
    const path = s.pathFor('search', 'spec', digest);
    await writeFile(pdfPath, 'not really a pdf, but bytes are BYTES');
    // Same file name (the name only carries 16 hex digits of the old hash): make the new
    // digest's path point at the old file, so only the meta check can catch it.
    const s2 = store();
    const digest2 = await sha256File(pdfPath);
    expect(digest2.size).toBe(digest.size);
    await writeFile(s2.pathFor('search', 'spec', digest2), await readFile(path));

    expect(await s2.load('search', 'spec', pdfPath)).toBeNull();
  });

  it('IS-5c: a different spec id over the same bytes is its own entry', async () => {
    const s = store();
    await s.save('search', 'iso32000-2', pdfPath, searchData, 1);
    expect(await s.load('search', 'iso32000-2-2020', pdfPath)).toBeNull();
  });
});

describe('damage is a miss, never a throw', () => {
  const corrupt = async (mutate: (raw: string) => string) => {
    const s = store();
    const path = await s.save('search', 'spec', pdfPath, searchData, 1);
    if (!path) throw new Error('save failed in fixture');
    await writeFile(path, mutate(await readFile(path, 'utf8')));
    return s;
  };

  it('IS-6: truncated JSON', async () => {
    const s = await corrupt((raw) => raw.slice(0, raw.length / 2));
    await expect(s.load('search', 'spec', pdfPath)).resolves.toBeNull();
  });

  it('IS-6b: valid JSON that is not an index file', async () => {
    const s = await corrupt(() => '[1,2,3]');
    await expect(s.load('search', 'spec', pdfPath)).resolves.toBeNull();
  });

  it('IS-7: meta intact, payload of the wrong shape', async () => {
    const s = await corrupt((raw) => {
      const file = JSON.parse(raw);
      file.data = { pages: [{ page: '1', section: '1', text: 'x' }] };
      return JSON.stringify(file);
    });
    await expect(s.load('search', 'spec', pdfPath)).resolves.toBeNull();
  });

  it('IS-7b: requirements payload that is not an array', async () => {
    const s = store();
    const path = await s.save('requirements', 'spec', pdfPath, requirementsData, 1);
    if (!path) throw new Error('save failed in fixture');
    const file = JSON.parse(await readFile(path, 'utf8'));
    file.data = { not: 'an array' };
    await writeFile(path, JSON.stringify(file));
    await expect(s.load('requirements', 'spec', pdfPath)).resolves.toBeNull();
  });

  it('IS-8: an unwritable directory: save resolves null, warns once, load misses', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const blocked = join(root, 'blocked');
    await writeFile(blocked, 'a file where the cache directory should be');
    const s = new FileIndexStore({ dir: blocked, enabled: true });

    expect(await s.save('search', 'spec', pdfPath, searchData, 1)).toBeNull();
    expect(await s.save('requirements', 'spec', pdfPath, requirementsData, 1)).toBeNull();
    expect(await s.load('search', 'spec', pdfPath)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('IS-8b: a PDF that cannot be hashed: no warning, nothing written', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const s = store();
    expect(await s.save('search', 'spec', join(root, 'missing.pdf'), searchData, 1)).toBeNull();
    expect(await s.load('search', 'spec', join(root, 'missing.pdf'))).toBeNull();
    expect(warn).not.toHaveBeenCalled();
    await expect(stat(join(root, 'cache'))).rejects.toThrow();
  });
});

describe('switches', () => {
  it('IS-9: disabled: load is null, save is null, nothing is created', async () => {
    const s = new FileIndexStore({ dir: join(root, 'cache'), env: { PDF_SPEC_CACHE: 'off' } });
    expect(await s.save('search', 'spec', pdfPath, searchData, 1)).toBeNull();
    expect(await s.load('search', 'spec', pdfPath)).toBeNull();
    await expect(stat(join(root, 'cache'))).rejects.toThrow();
    expect(s.describe().enabled).toBe(false);
  });

  it('IS-9b: bypassLoad skips reads but still writes (--build-cache --force)', async () => {
    await store().save('search', 'spec', pdfPath, searchData, 1);
    const forced = store({ bypassLoad: true });
    expect(await forced.load('search', 'spec', pdfPath)).toBeNull();
    expect(await forced.save('search', 'spec', pdfPath, searchData, 2)).not.toBeNull();
    expect((await store().load('search', 'spec', pdfPath))?.meta.buildTimeMs).toBe(2);
  });

  it('NullIndexStore reads and writes nothing', async () => {
    const s = new NullIndexStore();
    expect(await s.save()).toBeNull();
    expect(await s.load()).toBeNull();
  });
});

describe('atomic writes', () => {
  it('IS-10: no .tmp- file survives a save', async () => {
    const s = store();
    const path = await s.save('search', 'spec', pdfPath, searchData, 1);
    if (!path) throw new Error('save failed in fixture');
    const names = await readdir(join(path, '..'));
    expect(names.filter((n) => n.includes('.tmp-'))).toEqual([]);
    expect(names.length).toBe(1);
  });

  it('IS-11: concurrent saves to the same key leave one valid file', async () => {
    const s = store();
    const big = {
      pages: Array.from({ length: 2000 }, (_, i) => ({
        page: i,
        section: '',
        text: 'x'.repeat(500),
      })),
    };
    const paths = await Promise.all(
      Array.from({ length: 8 }, (_, i) => store().save('search', 'spec', pdfPath, big, i)),
    );
    expect(new Set(paths).size).toBe(1);
    const loaded = await s.load('search', 'spec', pdfPath);
    expect(loaded?.data.pages.length).toBe(2000);
    const names = await readdir(join(paths[0] as string, '..'));
    expect(names.length).toBe(1);
  });
});

describe('maintenance', () => {
  it('entries lists every index file under every version; clear removes them all', async () => {
    const s = store();
    await s.save('search', 'a', pdfPath, searchData, 1);
    await s.save('requirements', 'a', pdfPath, requirementsData, 1);
    await store({ versions: versions({ package: '0.0.1' }) }).save(
      'search',
      'b',
      pdfPath,
      searchData,
      1,
    );

    const entries = await s.entries();
    expect(entries.map((e) => e.relative).sort()).toEqual(
      [
        `v${INDEX_SCHEMA_VERSION}/0.0.1/b.search.${(await sha256File(pdfPath)).sha256.slice(0, 16)}.json`,
        `v${INDEX_SCHEMA_VERSION}/${PACKAGE_INFO.version}/a.requirements.${(await sha256File(pdfPath)).sha256.slice(0, 16)}.json`,
        `v${INDEX_SCHEMA_VERSION}/${PACKAGE_INFO.version}/a.search.${(await sha256File(pdfPath)).sha256.slice(0, 16)}.json`,
      ].sort(),
    );
    expect(entries.every((e) => e.bytes > 0)).toBe(true);

    expect(await s.clear()).toBe(true);
    expect(await s.entries()).toEqual([]);
    expect(await s.clear()).toBe(false);
  });

  it('a read-only directory: save is null with one warning (real EACCES)', async () => {
    if (process.getuid?.() === 0) return; // root ignores mode bits
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const dir = join(root, 'ro');
    await store({ dir }).save('search', 'spec', pdfPath, searchData, 1);
    await chmod(join(dir, `v${INDEX_SCHEMA_VERSION}`, PACKAGE_INFO.version), 0o500);
    try {
      const s = store({ dir });
      expect(await s.save('requirements', 'spec', pdfPath, requirementsData, 1)).toBeNull();
      // What was already there is still served.
      expect((await s.load('search', 'spec', pdfPath))?.data).toEqual(searchData);
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      await chmod(join(dir, `v${INDEX_SCHEMA_VERSION}`, PACKAGE_INFO.version), 0o700);
    }
  });
});
