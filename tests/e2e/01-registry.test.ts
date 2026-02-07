/**
 * 01 - Registry & Discovery E2E Tests
 *
 * R-1 〜 R-8: レジストリ初期化、specId 一意性、resolveSpecId、getSpecPath、enrichSpecInfo
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { HAS_PDFS, initRegistry, ALL_SPEC_IDS } from './setup.js';
import {
  ensureRegistryInitialized,
  listSpecs,
  isSpecAvailable,
  resolveSpecId,
  getSpecPath,
  getSpecInfo,
} from '../../src/services/pdf-registry.js';
import { toolHandlers } from '../../src/tools/handlers.js';

describe.skipIf(!HAS_PDFS)('01 - Registry & Discovery', () => {
  beforeAll(async () => {
    await initRegistry();
  });

  // R-1: 全17仕様の検出
  it('R-1: discoverSpecs() が17件のスペックを返す', () => {
    const specs = listSpecs();
    expect(specs).toHaveLength(17);
  });

  // R-2: 各specIdの一意性
  it('R-2: 全specIdが一意である', () => {
    const specs = listSpecs();
    const ids = specs.map((s) => s.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  // R-3: resolveSpecId(undefined)
  it('R-3: resolveSpecId(undefined) は "iso32000-2" を返す', () => {
    expect(resolveSpecId(undefined)).toBe('iso32000-2');
  });

  // R-4: resolveSpecId('pdf17')
  it('R-4: resolveSpecId("pdf17") は "pdf17" を返す', () => {
    expect(resolveSpecId('pdf17')).toBe('pdf17');
  });

  // R-5: resolveSpecId('unknown')
  it('R-5: resolveSpecId("unknown") はエラーをスロー', () => {
    expect(() => resolveSpecId('unknown')).toThrow('not found');
  });

  // R-6: getSpecPath の全specId
  it('R-6: 全17 specId が有効なファイルパスを返す', () => {
    for (const specId of ALL_SPEC_IDS) {
      const path = getSpecPath(specId);
      expect(path).toBeTruthy();
      expect(path.endsWith('.pdf')).toBe(true);
    }
  });

  // R-7: isSpecAvailable
  it('R-7: 全17 specId で true、"nonexistent" で false', () => {
    for (const specId of ALL_SPEC_IDS) {
      expect(isSpecAvailable(specId)).toBe(true);
    }
    expect(isSpecAvailable('nonexistent')).toBe(false);
  });

  // R-8: enrichSpecInfo 反映
  it('R-8: get_structure 後に pages/outlineEntries が非null', async () => {
    // get_structure を実行して enrichSpecInfo をトリガー
    await toolHandlers.get_structure({ spec: 'iso32000-2' });

    const info = getSpecInfo('iso32000-2');
    expect(info).toBeDefined();
    expect(info!.pages).not.toBeNull();
    expect(info!.pages).toBeGreaterThan(0);
    expect(info!.outlineEntries).not.toBeNull();
    expect(info!.outlineEntries).toBeGreaterThan(0);
  });
});
