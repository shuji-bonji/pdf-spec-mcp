/**
 * IndexStore — on-disk persistence for the expensive per-spec indexes (Issue #6).
 *
 * What is slow in this server is not opening a PDF (get_structure 139 ms, get_section
 * 273 ms cold) but walking *every page* of one: the search index takes ~6 s for ISO 32000-2
 * and the full requirements scan ~11 s, and both are paid again by every process — which,
 * with Claude Code spawning one server per session, is every session. This store keeps the
 * two results as JSON under the user's cache directory so the second process reads them in
 * tens of milliseconds.
 *
 * Nothing about *searching* changes: the same in-memory structure is walked by the same
 * code. Only where the structure comes from changes (built vs. read).
 *
 * Invariants:
 *   - `load` never throws and `save` never throws. A cache that cannot be read or written
 *     is a cache miss, never a tool failure. The PDF itself is still opened by the caller,
 *     and *that* is where a missing or unreadable file is reported.
 *   - A hit requires every field of the key to match (see `IndexMeta`). The package version
 *     is part of it on purpose: the index is a function of the extractor, and 0.4.2 / 0.4.3
 *     / 0.4.5 each changed how pages are cut into sections. Keyed on the PDF alone, an
 *     upgrade would keep serving the pre-fix index, and the symptom — slightly different
 *     search hits — is invisible.
 *   - Writes are atomic (tmp + rename), so a reader never sees a partial file and two
 *     processes building the same index at once cannot corrupt each other: same key, same
 *     bytes, last rename wins.
 *
 * Layout: <dir>/v<schemaVersion>/<packageVersion>/<specId>.<kind>.<sha256[0:16]>.json
 * The version directories exist so a human can see and delete stale generations; the meta
 * inside the file is still checked on every load.
 */

import { randomBytes } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { CACHE_ENV, INDEX_SCHEMA_VERSION, PACKAGE_INFO, PDFJS_VERSION } from '../config.js';
import type { PageText, Requirement } from '../types/index.js';
import { type FileDigest, sha256File } from '../utils/file-hash.js';
import { logger } from '../utils/logger.js';

export type IndexKind = 'search' | 'requirements';

/** Payload stored for each kind. Existing types, serialised as they are. */
export interface IndexPayload {
  search: { pages: PageText[] };
  requirements: Requirement[];
}

/** The cache key, plus provenance. Every key field must match for a hit. */
export interface IndexMeta {
  schemaVersion: number;
  packageVersion: string;
  pdfjsVersion: string;
  specId: string;
  kind: IndexKind;
  fileSha256: string;
  fileSize: number;
  /** Provenance only — not part of the key. */
  builtAt: string;
  buildTimeMs: number;
}

/** What is written to disk. */
export interface IndexFile<K extends IndexKind> {
  meta: IndexMeta;
  data: IndexPayload[K];
}

export interface LoadedIndex<K extends IndexKind> {
  data: IndexPayload[K];
  meta: IndexMeta;
  path: string;
  loadTimeMs: number;
}

/** The part of the store the service depends on. */
export interface IndexStore {
  /** Resolves to null on any miss — absent, unreadable, corrupt, or keyed differently. */
  load<K extends IndexKind>(
    kind: K,
    specId: string,
    pdfPath: string,
  ): Promise<LoadedIndex<K> | null>;
  /** Resolves to the written path, or null when the cache is off or the write failed. */
  save<K extends IndexKind>(
    kind: K,
    specId: string,
    pdfPath: string,
    data: IndexPayload[K],
    buildTimeMs: number,
  ): Promise<string | null>;
}

/** Versions that go into the key. Injectable so tests can prove a mismatch misses. */
export interface IndexVersions {
  schema: number;
  package: string;
  pdfjs: string;
}

export interface FileIndexStoreOptions {
  /** Explicit directory; otherwise resolved from `env` on first use. */
  dir?: string;
  /** Explicit on/off; otherwise resolved from `env` on first use. */
  enabled?: boolean;
  /** Skip reads (still writes) — `--build-cache --force`. */
  bypassLoad?: boolean;
  env?: NodeJS.ProcessEnv;
  versions?: IndexVersions;
}

export interface IndexStoreInfo {
  enabled: boolean;
  dir: string;
  bypassLoad: boolean;
  versions: IndexVersions;
}

/** One file found under the cache directory (for --cache-info). */
export interface IndexStoreEntry {
  path: string;
  bytes: number;
  /** Relative to the cache directory: v1/0.5.0/iso32000-2.search.<sha16>.json */
  relative: string;
}

/** Default: ${PDF_SPEC_CACHE_DIR} > ${XDG_CACHE_HOME}/pdf-spec-mcp > ~/.cache/pdf-spec-mcp */
export function resolveCacheDir(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env[CACHE_ENV.dir];
  if (explicit) return explicit;
  const base = env.XDG_CACHE_HOME || join(homedir(), '.cache');
  return join(base, 'pdf-spec-mcp');
}

/** `PDF_SPEC_CACHE=off` (also 0 / false) disables reads and writes. */
export function isCacheEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env[CACHE_ENV.toggle];
  if (raw === undefined) return true;
  return !['off', '0', 'false'].includes(raw.trim().toLowerCase());
}

const CURRENT_VERSIONS: IndexVersions = {
  schema: INDEX_SCHEMA_VERSION,
  package: PACKAGE_INFO.version,
  pdfjs: PDFJS_VERSION,
};

// ----------------------------------------------------------------------------
// Payload shape checks — deliberately shallow. When the meta matches, the shape is
// whatever this version wrote; these only reject a file whose `data` is not what the
// meta claims (truncated by a crash, edited by hand).
// ----------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPageText(value: unknown): value is PageText {
  return (
    isRecord(value) &&
    typeof value.page === 'number' &&
    typeof value.section === 'string' &&
    typeof value.text === 'string'
  );
}

function isRequirement(value: unknown): value is Requirement {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.level === 'string' &&
    typeof value.text === 'string' &&
    typeof value.section === 'string'
  );
}

const PAYLOAD_CHECKS: { [K in IndexKind]: (data: unknown) => data is IndexPayload[K] } = {
  search: (data): data is IndexPayload['search'] =>
    isRecord(data) && Array.isArray(data.pages) && data.pages.every(isPageText),
  requirements: (data): data is IndexPayload['requirements'] =>
    Array.isArray(data) && data.every(isRequirement),
};

const KEY_FIELDS = [
  'schemaVersion',
  'packageVersion',
  'pdfjsVersion',
  'specId',
  'kind',
  'fileSha256',
  'fileSize',
] as const;

// ----------------------------------------------------------------------------
// FileIndexStore
// ----------------------------------------------------------------------------

export class FileIndexStore implements IndexStore {
  private readonly options: FileIndexStoreOptions;
  private resolved: { enabled: boolean; dir: string } | null = null;
  private readonly digests = new Map<string, Promise<FileDigest>>();
  private warnedWrite = false;

  constructor(options: FileIndexStoreOptions = {}) {
    this.options = options;
  }

  /**
   * Settings are read on first use, not at construction: the default instance is created
   * at module load, before a test's beforeAll (or a CLI) has set the environment.
   */
  private settings(): { enabled: boolean; dir: string } {
    if (!this.resolved) {
      const env = this.options.env ?? process.env;
      this.resolved = {
        enabled: this.options.enabled ?? isCacheEnabled(env),
        dir: this.options.dir ?? resolveCacheDir(env),
      };
    }
    return this.resolved;
  }

  private get versions(): IndexVersions {
    return this.options.versions ?? CURRENT_VERSIONS;
  }

  describe(): IndexStoreInfo {
    const { enabled, dir } = this.settings();
    return { enabled, dir, bypassLoad: this.options.bypassLoad === true, versions: this.versions };
  }

  /**
   * Memoised per (path, size, mtime) — a stat per call, a hash per distinct file. A file
   * replaced while the process runs is re-hashed instead of served under the old key. A
   * failed digest is forgotten so the next call retries.
   */
  private async digest(pdfPath: string): Promise<FileDigest> {
    const s = await stat(pdfPath);
    const key = `${pdfPath}|${s.size}|${s.mtimeMs}`;
    let pending = this.digests.get(key);
    if (!pending) {
      pending = sha256File(pdfPath).catch((err) => {
        this.digests.delete(key);
        throw err;
      });
      this.digests.set(key, pending);
    }
    return pending;
  }

  /** Where the file for this key lives. Exposed for tests and --cache-info. */
  pathFor(kind: IndexKind, specId: string, digest: FileDigest): string {
    const { dir } = this.settings();
    const v = this.versions;
    return join(
      dir,
      `v${v.schema}`,
      v.package,
      `${specId}.${kind}.${digest.sha256.slice(0, 16)}.json`,
    );
  }

  private expectedKey(kind: IndexKind, specId: string, digest: FileDigest) {
    const v = this.versions;
    return {
      schemaVersion: v.schema,
      packageVersion: v.package,
      pdfjsVersion: v.pdfjs,
      specId,
      kind,
      fileSha256: digest.sha256,
      fileSize: digest.size,
    };
  }

  async load<K extends IndexKind>(
    kind: K,
    specId: string,
    pdfPath: string,
  ): Promise<LoadedIndex<K> | null> {
    if (!this.settings().enabled || this.options.bypassLoad) return null;
    const start = Date.now();

    let digest: FileDigest;
    try {
      digest = await this.digest(pdfPath);
    } catch (err) {
      logger.debug('IndexStore', `[${specId}] cannot hash ${pdfPath}: ${err}`);
      return null;
    }
    const path = this.pathFor(kind, specId, digest);

    let raw: string;
    try {
      raw = await readFile(path, 'utf8');
    } catch {
      logger.debug('IndexStore', `[${specId}] ${kind}: miss (${path})`);
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      logger.debug('IndexStore', `[${specId}] ${kind}: unreadable JSON, rebuilding (${path})`);
      return null;
    }

    if (!isRecord(parsed) || !isRecord(parsed.meta)) {
      logger.debug('IndexStore', `[${specId}] ${kind}: no meta, rebuilding (${path})`);
      return null;
    }
    const expected = this.expectedKey(kind, specId, digest);
    for (const field of KEY_FIELDS) {
      if (parsed.meta[field] !== expected[field]) {
        logger.debug(
          'IndexStore',
          `[${specId}] ${kind}: ${field} mismatch (${String(parsed.meta[field])} != ${String(expected[field])}), rebuilding`,
        );
        return null;
      }
    }
    if (!PAYLOAD_CHECKS[kind](parsed.data)) {
      logger.debug('IndexStore', `[${specId}] ${kind}: payload shape rejected, rebuilding`);
      return null;
    }

    return {
      data: parsed.data,
      meta: parsed.meta as unknown as IndexMeta,
      path,
      loadTimeMs: Date.now() - start,
    };
  }

  async save<K extends IndexKind>(
    kind: K,
    specId: string,
    pdfPath: string,
    data: IndexPayload[K],
    buildTimeMs: number,
  ): Promise<string | null> {
    if (!this.settings().enabled) return null;

    // A PDF that cannot be hashed cannot have been indexed either; the caller already
    // reported (or will report) the real failure. Not a cache problem — no warning.
    let digest: FileDigest;
    try {
      digest = await this.digest(pdfPath);
    } catch (err) {
      logger.debug('IndexStore', `[${specId}] cannot hash ${pdfPath}, not saving: ${err}`);
      return null;
    }

    try {
      const path = this.pathFor(kind, specId, digest);
      const meta: IndexMeta = {
        ...this.expectedKey(kind, specId, digest),
        builtAt: new Date().toISOString(),
        buildTimeMs,
      };
      const file: IndexFile<K> = { meta, data };
      await mkdir(dirname(path), { recursive: true });
      const tmp = `${path}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`;
      try {
        await writeFile(tmp, JSON.stringify(file), 'utf8');
        await rename(tmp, path);
      } catch (err) {
        await rm(tmp, { force: true });
        throw err;
      }
      logger.debug('IndexStore', `[${specId}] ${kind}: saved ${path}`);
      return path;
    } catch (err) {
      if (!this.warnedWrite) {
        this.warnedWrite = true;
        logger.warn(
          'IndexStore',
          `Cannot write index cache under ${this.settings().dir} (${err}). ` +
            `Indexes will be rebuilt on every start; set ${CACHE_ENV.dir} to a writable ` +
            `directory or ${CACHE_ENV.toggle}=off to silence this.`,
        );
      }
      return null;
    }
  }

  /** Remove the whole cache directory (every schema and package version). */
  async clear(): Promise<boolean> {
    const { dir } = this.settings();
    try {
      await stat(dir);
    } catch {
      return false;
    }
    await rm(dir, { recursive: true, force: true });
    return true;
  }

  /** Every index file under the cache directory, any version. */
  async entries(): Promise<IndexStoreEntry[]> {
    const { dir } = this.settings();
    const out: IndexStoreEntry[] = [];
    const walk = async (d: string, rel: string): Promise<void> => {
      let names: string[];
      try {
        names = await readdir(d);
      } catch {
        return;
      }
      for (const name of names.sort()) {
        const p = join(d, name);
        const r = rel ? `${rel}/${name}` : name;
        const s = await stat(p);
        if (s.isDirectory()) await walk(p, r);
        else if (name.endsWith('.json')) out.push({ path: p, bytes: s.size, relative: r });
      }
    };
    await walk(dir, '');
    return out;
  }
}

/** Reads nothing, writes nothing. For tests and for callers that must not touch disk. */
export class NullIndexStore implements IndexStore {
  async load(): Promise<null> {
    return null;
  }
  async save(): Promise<null> {
    return null;
  }
}

/**
 * The process-wide store. Environment is consulted on first use (see `settings`), so
 * setting PDF_SPEC_CACHE_DIR / PDF_SPEC_CACHE before the first tool call is enough.
 */
export const defaultIndexStore = new FileIndexStore();
