/**
 * list_specs が、認識しなかったファイルを名指すこと（list-specs。pdf-spec-mcp#32・F-27）。
 *
 * 仕様書の PDF は中身を読まない（ファイル名でパターンに当てるだけ）ので、空のファイルで組む。
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RegistryService } from './services/pdf-registry.js';
import { toolHandlers } from './tools/handlers.js';

let mixed: string;
let clean: string;
const originalEnv = process.env.PDF_SPEC_DIR;

beforeAll(async () => {
  mixed = await mkdtemp(join(tmpdir(), 'pdf-spec-list-mixed-'));
  for (const f of ['ISO_32000-2_sponsored-ec2.pdf', 'notes-2026.pdf', 'readme.txt']) {
    await writeFile(join(mixed, f), '');
  }
  clean = await mkdtemp(join(tmpdir(), 'pdf-spec-list-clean-'));
  await writeFile(join(clean, 'ISO_32000-2_sponsored-ec2.pdf'), '');
});

afterAll(async () => {
  process.env.PDF_SPEC_DIR = originalEnv;
  await rm(mixed, { recursive: true, force: true });
  await rm(clean, { recursive: true, force: true });
});

describe('SPEC-PDFSPEC-LIST-SPECS-001 認識しなかったファイルの名前を返す', () => {
  it('SPEC-PDFSPEC-LIST-SPECS-001 パターンに無い PDF がある', async () => {
    process.env.PDF_SPEC_DIR = mixed;
    const result = (await toolHandlers.list_specs({})) as unknown as {
      unrecognizedFiles?: string[];
      specs: { filename: string }[];
    };
    expect(result.unrecognizedFiles).toEqual(['notes-2026.pdf']);
    expect(result.specs.map((s) => s.filename)).not.toContain('notes-2026.pdf');
  });

  it('SPEC-PDFSPEC-LIST-SPECS-001 すべて認識した', async () => {
    const registry = new RegistryService();
    process.env.PDF_SPEC_DIR = clean;
    await registry.ensureInitialized();
    expect(
      (registry as unknown as { getUnrecognizedFiles?: () => string[] }).getUnrecognizedFiles?.(),
    ).toEqual([]);
  });
});
