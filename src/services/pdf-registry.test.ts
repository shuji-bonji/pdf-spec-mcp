/**
 * pdf-registry.ts unit tests
 * Tests spec discovery, resolution, and enrichment.
 *
 * Uses a temporary directory with mock PDF filenames (empty files).
 * Only filename-pattern matching is tested — no actual PDF parsing.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// We import from the built JS to avoid module-state issues.
// The registry is module-level singleton, so we test in a controlled order.
import {
  enrichSpecInfo,
  ensureRegistryInitialized,
  findUnexpandedEnvReference,
  getSpecInfo,
  getSpecPath,
  isSpecAvailable,
  listSpecs,
  RegistryService,
  resolveSpecId,
} from './pdf-registry.js';

let tempDir: string;
const originalEnv = process.env.PDF_SPEC_DIR;

beforeAll(async () => {
  // Create temp directory with mock PDF files (empty, just for filename matching)
  tempDir = await mkdtemp(join(tmpdir(), 'pdf-spec-test-'));

  const mockFiles = [
    'ISO_32000-2_sponsored-ec2.pdf', // → iso32000-2
    'PDF32000_2008.pdf', // → pdf17
    'ISO_TS_32002_sponsored.pdf', // → ts32002
    'readme.txt', // non-PDF → skip
    'some-random.pdf', // unrecognized → skip
  ];

  for (const file of mockFiles) {
    await writeFile(join(tempDir, file), '');
  }

  process.env.PDF_SPEC_DIR = tempDir;
  await ensureRegistryInitialized();
});

afterAll(async () => {
  process.env.PDF_SPEC_DIR = originalEnv;
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
  }
});

// ========================================
// Discovery
// ========================================

describe('ensureRegistryInitialized + listSpecs', () => {
  it('should discover PDFs matching SPEC_PATTERNS', () => {
    const specs = listSpecs();
    expect(specs.length).toBe(3); // iso32000-2, pdf17, ts32002
  });

  it('should return SpecInfo with correct IDs', () => {
    const ids = listSpecs().map((s) => s.id);
    expect(ids).toContain('iso32000-2');
    expect(ids).toContain('pdf17');
    expect(ids).toContain('ts32002');
  });

  it('should have pages=null and outlineEntries=null before PDF opened', () => {
    for (const spec of listSpecs()) {
      expect(spec.pages).toBeNull();
      expect(spec.outlineEntries).toBeNull();
    }
  });

  it('should have correct titles', () => {
    const info = getSpecInfo('iso32000-2');
    expect(info?.title).toContain('ISO 32000-2');
  });

  it('should have correct categories', () => {
    expect(getSpecInfo('iso32000-2')?.category).toBe('standard');
    expect(getSpecInfo('pdf17')?.category).toBe('standard');
    expect(getSpecInfo('ts32002')?.category).toBe('ts');
  });
});

// ========================================
// Category filter
// ========================================

describe('listSpecs with category filter', () => {
  it('should filter by standard category', () => {
    const standards = listSpecs('standard');
    expect(standards.length).toBe(2); // iso32000-2 + pdf17
  });

  it('should filter by ts category', () => {
    const ts = listSpecs('ts');
    expect(ts.length).toBe(1); // ts32002
  });

  it('should return empty for category with no matches', () => {
    expect(listSpecs('guide').length).toBe(0);
    expect(listSpecs('pdfua').length).toBe(0);
    expect(listSpecs('appnote').length).toBe(0);
  });
});

// ========================================
// resolveSpecId
// ========================================

describe('resolveSpecId', () => {
  it('should return DEFAULT_SPEC_ID when no specId given', () => {
    expect(resolveSpecId()).toBe('iso32000-2');
  });

  it('should return DEFAULT_SPEC_ID for undefined', () => {
    expect(resolveSpecId(undefined)).toBe('iso32000-2');
  });

  it('should return specId as-is when available', () => {
    expect(resolveSpecId('pdf17')).toBe('pdf17');
    expect(resolveSpecId('ts32002')).toBe('ts32002');
  });

  it('should throw for unknown specId', () => {
    expect(() => resolveSpecId('nonexistent')).toThrow();
  });
});

// ========================================
// isSpecAvailable
// ========================================

describe('isSpecAvailable', () => {
  it('should return true for discovered specs', () => {
    expect(isSpecAvailable('iso32000-2')).toBe(true);
    expect(isSpecAvailable('pdf17')).toBe(true);
    expect(isSpecAvailable('ts32002')).toBe(true);
  });

  it('should return false for missing specs', () => {
    expect(isSpecAvailable('pdfua1')).toBe(false);
    expect(isSpecAvailable('nonexistent')).toBe(false);
  });
});

// ========================================
// getSpecPath
// ========================================

describe('getSpecPath', () => {
  it('should return full path for available spec', () => {
    const path = getSpecPath('iso32000-2');
    expect(path).toBe(join(tempDir, 'ISO_32000-2_sponsored-ec2.pdf'));
  });

  it('should return full path for pdf17', () => {
    const path = getSpecPath('pdf17');
    expect(path).toBe(join(tempDir, 'PDF32000_2008.pdf'));
  });

  it('should throw for unavailable spec', () => {
    expect(() => getSpecPath('nonexistent')).toThrow();
  });
});

// ========================================
// enrichSpecInfo
// ========================================

describe('enrichSpecInfo', () => {
  it('should update pages and outlineEntries', () => {
    enrichSpecInfo('ts32002', { pages: 13, outlineEntries: 15 });
    const info = getSpecInfo('ts32002');
    expect(info?.pages).toBe(13);
    expect(info?.outlineEntries).toBe(15);
  });

  it('should handle unknown specId gracefully (no throw)', () => {
    expect(() => enrichSpecInfo('nonexistent', { pages: 1 })).not.toThrow();
  });
});

// ========================================
// Unexpanded ${VAR} in PDF_SPEC_DIR (Issue #14)
// ========================================

// Build `${NAME}` without writing the placeholder into a string literal (biome's
// noTemplateCurlyInString would flag the literal form).
const ref = (name: string) => `$\{${name}}`;

describe('findUnexpandedEnvReference', () => {
  it('returns the first braced reference left in the value', () => {
    expect(findUnexpandedEnvReference(ref('PDF_SPEC_DIR'))).toBe(ref('PDF_SPEC_DIR'));
    expect(findUnexpandedEnvReference(`/home/x/${ref('HOME')}/specs`)).toBe(ref('HOME'));
  });

  it('returns null for a plain path, including one with a bare $', () => {
    expect(findUnexpandedEnvReference('/Users/x/pdf-spec')).toBeNull();
    expect(findUnexpandedEnvReference('/tmp/$weird/dir')).toBeNull();
    expect(findUnexpandedEnvReference(`$\{not a name}`)).toBeNull();
  });
});

describe('discoverSpecs with an unexpanded PDF_SPEC_DIR reference', () => {
  // A fresh instance: the module singleton was initialised with tempDir in beforeAll.
  const withEnv = async (value: string, run: () => Promise<unknown>) => {
    const saved = process.env.PDF_SPEC_DIR;
    process.env.PDF_SPEC_DIR = value;
    try {
      return await run();
    } finally {
      process.env.PDF_SPEC_DIR = saved;
    }
  };

  it('names the host, not the directory, as the thing to fix', async () => {
    const registry = new RegistryService();
    const err = (await withEnv(ref('PDF_SPEC_DIR'), () =>
      registry.ensureInitialized().then(
        () => null,
        (e: unknown) => e,
      ),
    )) as { code: string; message: string; hint?: string; next_actions?: { action: string }[] };

    expect(err).not.toBeNull();
    expect(err.code).toBe('REGISTRY_ERROR');
    expect(err.message).toContain('unexpanded');
    expect(err.message).toContain(ref('PDF_SPEC_DIR'));
    // The old message said "Cannot read PDF_SPEC_DIR" and sent the reader to check the directory.
    expect(err.message).not.toContain('Cannot read');
    expect(err.hint).toContain('host');
    expect(err.next_actions?.[0]?.action).toBe('set_absolute_path_in_host_config');
  });

  it('still reports a genuinely missing directory as unreadable', async () => {
    const registry = new RegistryService();
    const err = (await withEnv('/nonexistent/pdf-spec-mcp-test-dir', () =>
      registry.ensureInitialized().then(
        () => null,
        (e: unknown) => e,
      ),
    )) as { message: string };
    expect(err.message).toContain('Cannot read PDF_SPEC_DIR');
  });
});
