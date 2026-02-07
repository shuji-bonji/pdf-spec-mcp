/**
 * 02 - list_specs E2E Tests
 *
 * L-1 〜 L-8: カテゴリフィルタ、必須フィールド検証
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { HAS_PDFS, initRegistry } from './setup.js';
import { toolHandlers } from '../../src/tools/handlers.js';

describe.skipIf(!HAS_PDFS)('02 - list_specs', () => {
  beforeAll(async () => {
    await initRegistry();
  });

  // L-1: フィルタなし
  it('L-1: フィルタなしで totalSpecs=17', async () => {
    const result = await toolHandlers.list_specs({});
    expect(result.totalSpecs).toBe(17);
    expect(result.specs).toHaveLength(17);
  });

  // L-2: category=standard
  it('L-2: category=standard で totalSpecs=4', async () => {
    const result = await toolHandlers.list_specs({ category: 'standard' });
    expect(result.totalSpecs).toBe(4);
    const ids = result.specs.map((s) => s.id);
    expect(ids).toContain('iso32000-2');
    expect(ids).toContain('pdf17');
    expect(ids).toContain('pdf17old');
    expect(ids).toContain('iso32000-2-2020');
  });

  // L-3: category=ts
  it('L-3: category=ts で totalSpecs=5', async () => {
    const result = await toolHandlers.list_specs({ category: 'ts' });
    expect(result.totalSpecs).toBe(5);
  });

  // L-4: category=pdfua
  it('L-4: category=pdfua で totalSpecs=2', async () => {
    const result = await toolHandlers.list_specs({ category: 'pdfua' });
    expect(result.totalSpecs).toBe(2);
  });

  // L-5: category=guide
  it('L-5: category=guide で totalSpecs=3', async () => {
    const result = await toolHandlers.list_specs({ category: 'guide' });
    expect(result.totalSpecs).toBe(3);
  });

  // L-6: category=appnote
  it('L-6: category=appnote で totalSpecs=3', async () => {
    const result = await toolHandlers.list_specs({ category: 'appnote' });
    expect(result.totalSpecs).toBe(3);
  });

  // L-7: 無効なcategory
  it('L-7: 無効な category で totalSpecs=0', async () => {
    const result = await toolHandlers.list_specs({ category: 'invalid' });
    expect(result.totalSpecs).toBe(0);
    expect(result.specs).toHaveLength(0);
  });

  // L-8: 各specの必須フィールド
  it('L-8: 全 spec が id, title, filename, category, description を持つ', async () => {
    const result = await toolHandlers.list_specs({});
    for (const spec of result.specs) {
      expect(spec.id).toBeTruthy();
      expect(spec.title).toBeTruthy();
      expect(spec.filename).toBeTruthy();
      expect(spec.category).toBeTruthy();
      expect(spec.description).toBeTruthy();
      expect(['standard', 'ts', 'pdfua', 'guide', 'appnote']).toContain(spec.category);
    }
  });
});
