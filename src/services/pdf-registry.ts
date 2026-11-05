/**
 * PDF Document Registry
 * Auto-discovers PDFs from PDF_SPEC_DIR and maps spec IDs to file paths.
 *
 * Two-phase initialization:
 *   1. discoverSpecs() — file scan only (path + pattern match)
 *   2. enrichSpecInfo() — open PDF to get pages/outlineEntries (on first tool access)
 *
 * Freshness (spec-sources, #29 / #30): every `ensureInitialized` stats PDF_SPEC_DIR and
 * re-scans when its modification time moved (a spec added, removed or renamed), and stats
 * each registered spec so `getSpecVersion` changes when a file is replaced in place. A
 * failed scan is not remembered. The cost is one `stat` for the directory and one per
 * registered spec — small next to opening a specification.
 */

import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { DEFAULT_SPEC_ID, PDF_CONFIG, SPEC_PATTERNS } from '../config.js';
import { NEXT_ACTIONS, RegistryError, ValidationError } from '../errors.js';
import type { SpecCategory, SpecId, SpecInfo } from '../types/index.js';
import { logger } from '../utils/logger.js';

interface RegistryEntry {
  path: string;
  info: SpecInfo;
  /** Size and modification time at the last check. `null` when the file could not be stat'ed. */
  fingerprint: FileFingerprint | null;
}

interface FileFingerprint {
  size: number;
  mtimeMs: number;
}

async function fingerprintOf(path: string): Promise<FileFingerprint | null> {
  try {
    const s = await stat(path);
    return { size: s.size, mtimeMs: s.mtimeMs };
  } catch {
    return null;
  }
}

function sameFingerprint(a: FileFingerprint | null, b: FileFingerprint | null): boolean {
  if (a === null || b === null) return a === b;
  return a.size === b.size && a.mtimeMs === b.mtimeMs;
}

/**
 * Return the first `${NAME}` reference left in an environment value, or `null` when the
 * value contains none. A shell or a well-behaved host substitutes these before the process
 * starts; when one survives, the value is text, not a path, whatever `readdir` says.
 *
 * `$NAME` without braces is deliberately not matched: a literal `$` is legal in a path, and
 * plugin manifests only ever write the braced form.
 */
export function findUnexpandedEnvReference(value: string): string | null {
  const match = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/.exec(value);
  return match ? match[0] : null;
}

/**
 * RegistryService encapsulates all PDF spec registry functionality
 */
export class RegistryService {
  private registry = new Map<SpecId, RegistryEntry>();
  private discoveryDone = false;
  /** The directory and its modification time at the last successful scan. */
  private scanned: { dir: string; mtimeMs: number } | null = null;
  /** `.pdf` files in PDF_SPEC_DIR that no pattern recognised (SPEC-PDFSPEC-LIST-SPECS-001) */
  private unrecognized: string[] = [];
  /** The refresh in flight, shared by concurrent callers. Cleared when it settles. */
  private refreshing: Promise<void> | null = null;

  /**
   * Ensure the registry reflects PDF_SPEC_DIR as it is now.
   *
   * Safe to call on every tool call — the first call scans; later calls stat the directory
   * and re-scan only when it changed, then stat each registered spec. A failed scan is not
   * remembered (spec-sources 001): the next call tries again, so creating the directory or
   * putting a spec in it takes effect without a restart.
   */
  async ensureInitialized(): Promise<void> {
    this.refreshing ??= this.refresh().finally(() => {
      this.refreshing = null;
    });
    await this.refreshing;
  }

  private async refresh(): Promise<void> {
    const dir = process.env[PDF_CONFIG.envVar];
    if (this.discoveryDone && this.scanned !== null && dir === this.scanned.dir) {
      const dirStat = await stat(dir).catch(() => null);
      if (dirStat !== null && dirStat.mtimeMs === this.scanned.mtimeMs) {
        await this.refreshFingerprints();
        return;
      }
    }
    await this.discoverSpecs();
  }

  /** Re-stat each registered spec; a replaced file forgets the metadata read from the old one. */
  private async refreshFingerprints(): Promise<void> {
    await Promise.all(
      [...this.registry.values()].map(async (entry) => {
        const current = await fingerprintOf(entry.path);
        if (!sameFingerprint(entry.fingerprint, current)) {
          entry.fingerprint = current;
          entry.info.pages = null;
          entry.info.outlineEntries = null;
        }
      }),
    );
  }

  /**
   * A string that changes whenever the spec's file is replaced (path, size, modification
   * time), or `undefined` for an unknown spec. pdf-service compares it with the value its
   * indexes were built from and drops them when it moved (spec-sources 002).
   */
  getSpecVersion(specId: string): string | undefined {
    const entry = this.registry.get(specId);
    if (!entry) return undefined;
    const f = entry.fingerprint;
    return f === null ? `${entry.path}|unreadable` : `${entry.path}|${f.size}|${f.mtimeMs}`;
  }

  /**
   * Scan PDF_SPEC_DIR and register matching PDFs.
   */
  private async discoverSpecs(): Promise<void> {
    const dir = process.env[PDF_CONFIG.envVar];
    if (!dir) {
      throw new RegistryError(
        `Environment variable ${PDF_CONFIG.envVar} is not set. ` +
          `Set it to the directory containing PDF specification files.`,
        {
          hint: 'The server cannot locate any specification PDF without this.',
          next_actions: [NEXT_ACTIONS.setSpecDir(PDF_CONFIG.envVar)],
        },
      );
    }

    // The value is the text `${PDF_SPEC_DIR}` itself (or contains such a reference). The host
    // that spawned us copied the plugin's env verbatim without expanding it. `readdir` would
    // fail on this too, but with "no such directory" — which sends the reader off to check
    // the directory, when the thing to fix is the host configuration (Issue #14).
    const unexpanded = findUnexpandedEnvReference(dir);
    if (unexpanded) {
      throw new RegistryError(
        `${PDF_CONFIG.envVar} is the unexpanded text "${dir}" — the host did not substitute ` +
          `the ${unexpanded} reference, so no directory was named.`,
        {
          hint:
            `Not a missing directory: the plugin env declares "${dir}" and this host passed ` +
            "that text through verbatim. Put the absolute path in the host's own configuration.",
          next_actions: [
            NEXT_ACTIONS.expandEnvInHostConfig(PDF_CONFIG.envVar, dir),
            NEXT_ACTIONS.setSpecDir(PDF_CONFIG.envVar),
          ],
        },
      );
    }

    // Stat before readdir: a spec added between the two moves the time past what we record,
    // so the next call scans again rather than missing it.
    const dirStat = await stat(dir).catch(() => null);
    let files: string[];
    try {
      files = await readdir(dir);
    } catch (err) {
      throw new RegistryError(`Cannot read PDF_SPEC_DIR "${dir}": ${err}`, {
        hint: 'The directory is set but unreadable — check that it exists and is accessible.',
        next_actions: [NEXT_ACTIONS.setSpecDir(PDF_CONFIG.envVar)],
      });
    }

    const pdfFiles = files.filter((f) => f.toLowerCase().endsWith('.pdf'));
    let matched = 0;
    const previous = this.registry;
    const next = new Map<SpecId, RegistryEntry>();

    // Process files in SPEC_PATTERNS priority order (not readdir order),
    // so that for duplicate IDs the earlier pattern wins (e.g. EC3 over EC2).
    const prioritized = pdfFiles
      .map((filename) => ({
        filename,
        patternIndex: SPEC_PATTERNS.findIndex((p) => p.pattern.test(filename)),
      }))
      .sort((a, b) => a.patternIndex - b.patternIndex);

    for (const { filename, patternIndex } of prioritized) {
      const pattern = patternIndex >= 0 ? SPEC_PATTERNS[patternIndex] : undefined;
      if (!pattern) {
        logger.debug('PDFRegistry', `Skipping unrecognized PDF: ${filename}`);
        continue;
      }

      // Skip if this ID is already registered (higher-priority pattern wins)
      if (next.has(pattern.id)) {
        logger.debug('PDFRegistry', `Duplicate pattern match for "${pattern.id}", keeping first`);
        continue;
      }

      const path = join(dir, filename);
      const fingerprint = await fingerprintOf(path);
      // Keep what was read from the file (pages, outline entries) only when it is the same file.
      const before = previous.get(pattern.id);
      const unchanged = before?.path === path && sameFingerprint(before.fingerprint, fingerprint);
      next.set(pattern.id, {
        path,
        fingerprint,
        info: {
          id: pattern.id,
          title: pattern.title,
          filename,
          pages: unchanged ? before.info.pages : null,
          category: pattern.category,
          outlineEntries: unchanged ? before.info.outlineEntries : null,
          description: pattern.description,
        },
      });
      matched++;
    }

    this.registry = next;
    this.unrecognized = prioritized
      .filter((p) => p.patternIndex < 0)
      .map((p) => p.filename)
      .sort();
    this.scanned = dirStat === null ? null : { dir, mtimeMs: dirStat.mtimeMs };
    this.discoveryDone = true;
    logger.info(
      'PDFRegistry',
      `Discovered ${matched} specs from ${pdfFiles.length} PDFs in ${dir}`,
    );
  }

  /**
   * The `.pdf` files in PDF_SPEC_DIR that no pattern recognised, so they were not read
   * (SPEC-PDFSPEC-LIST-SPECS-001). Sorted by name.
   */
  getUnrecognizedFiles(): string[] {
    return [...this.unrecognized];
  }

  /**
   * Get the file path for a spec ID.
   * Throws if spec is not available.
   */
  getSpecPath(specId: string): string {
    const entry = this.registry.get(specId);
    if (!entry) {
      const available = [...this.registry.keys()].join(', ');
      // SPEC-PDFSPEC-COMMON-ERRORS-002: an unknown id is an argument error (0.13.x: REGISTRY_ERROR)
      throw new ValidationError(
        `Specification "${specId}" not found. Available specs: ${available || '(none — run list_specs first)'}`,
        { next_actions: [NEXT_ACTIONS.listSpecs()] },
      );
    }
    return entry.path;
  }

  /**
   * Get SpecInfo for a spec ID (or undefined if not found).
   */
  getSpecInfo(specId: string): SpecInfo | undefined {
    return this.registry.get(specId)?.info;
  }

  /**
   * List all discovered specs, optionally filtered by category.
   */
  listSpecs(category?: SpecCategory): SpecInfo[] {
    const all = [...this.registry.values()].map((e) => e.info);
    if (category) {
      return all.filter((s) => s.category === category);
    }
    return all;
  }

  /**
   * Check if a spec ID is available.
   */
  isSpecAvailable(specId: string): boolean {
    return this.registry.has(specId);
  }

  /**
   * Resolve a spec ID: return as-is if provided, otherwise return DEFAULT_SPEC_ID.
   * Validates that the resolved ID exists in the registry.
   */
  resolveSpecId(specId?: string): string {
    const id = specId ?? DEFAULT_SPEC_ID;
    if (!this.registry.has(id)) {
      const available = [...this.registry.keys()].join(', ');
      // SPEC-PDFSPEC-COMMON-ERRORS-002: an unknown id is an argument error (0.13.x: REGISTRY_ERROR)
      throw new ValidationError(
        `Specification "${id}" not found. Available specs: ${available || '(none)'}`,
        { next_actions: [NEXT_ACTIONS.listSpecs()] },
      );
    }
    return id;
  }

  /**
   * Update SpecInfo with runtime metadata (pages, outlineEntries).
   * Called by pdf-service after loading/indexing a spec for the first time.
   */
  enrichSpecInfo(specId: string, data: { pages?: number; outlineEntries?: number }): void {
    const entry = this.registry.get(specId);
    if (!entry) return;

    if (data.pages !== undefined && entry.info.pages === null) {
      entry.info.pages = data.pages;
    }
    if (data.outlineEntries !== undefined && entry.info.outlineEntries === null) {
      entry.info.outlineEntries = data.outlineEntries;
    }
  }
}

// Default instance
export const defaultRegistry = new RegistryService();

// Backward compatibility: thin adapters to default instance
export const ensureRegistryInitialized = () => defaultRegistry.ensureInitialized();
export const getSpecVersion = (specId: string) => defaultRegistry.getSpecVersion(specId);
export const getSpecPath = (specId: string) => defaultRegistry.getSpecPath(specId);
export const getSpecInfo = (specId: string) => defaultRegistry.getSpecInfo(specId);
export const listSpecs = (category?: SpecCategory) => defaultRegistry.listSpecs(category);
export const isSpecAvailable = (specId: string) => defaultRegistry.isSpecAvailable(specId);
export const resolveSpecId = (specId?: string) => defaultRegistry.resolveSpecId(specId);
export const getUnrecognizedFiles = () => defaultRegistry.getUnrecognizedFiles();
export const enrichSpecInfo = (specId: string, data: { pages?: number; outlineEntries?: number }) =>
  defaultRegistry.enrichSpecInfo(specId, data);
