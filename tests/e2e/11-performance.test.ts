/**
 * 11 - Performance Baseline E2E Tests
 *
 * P-1 〜 P-11: コールド/キャッシュ計測、パフォーマンスベースライン記録
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { HAS_PDFS, initRegistry, ALL_SPEC_IDS } from './setup.js';
import { withTiming, recordPerformance, saveBaseline, checkRegression } from './helpers.js';
import { toolHandlers } from '../../src/tools/handlers.js';
import { ensureRegistryInitialized } from '../../src/services/pdf-registry.js';

describe.skipIf(!HAS_PDFS)('11 - Performance Baseline', () => {
  beforeAll(async () => {
    // 環境変数のみ設定（計測のためにレジストリはまだ初期化しない）
    if (!process.env.PDF_SPEC_DIR) {
      process.env.PDF_SPEC_DIR = './pdf-spec';
    }
  });

  afterAll(() => {
    // ベースラインを保存
    saveBaseline();
  });

  // P-1: ensureRegistryInitialized (コールド)
  it('P-1: ensureRegistryInitialized (コールド) < 100ms', async () => {
    const { durationMs } = await withTiming(() => ensureRegistryInitialized());
    recordPerformance('registry-init-cold', durationMs);
    // レジストリ初期化はファイルスキャンのみなので高速
    expect(durationMs).toBeLessThan(100);
  });

  // P-2: get_structure (iso32000-2, コールド)
  it('P-2: get_structure iso32000-2 (コールド) < 2000ms', async () => {
    const { durationMs } = await withTiming(() =>
      toolHandlers.get_structure({ spec: 'iso32000-2' })
    );
    recordPerformance('get_structure-cold', durationMs);

    const regression = checkRegression('get_structure-cold', durationMs);
    if (regression.regressed) {
      console.warn(
        `⚠️ get_structure コールド性能劣化: ${regression.baselineMs}ms → ${durationMs}ms (${regression.changePercent}%)`
      );
    }
    expect(durationMs).toBeLessThan(2000);
  });

  // P-3: get_structure (iso32000-2, キャッシュ)
  it('P-3: get_structure iso32000-2 (キャッシュ) < 50ms', async () => {
    // P-2 でキャッシュ済み
    const { durationMs } = await withTiming(() =>
      toolHandlers.get_structure({ spec: 'iso32000-2' })
    );
    recordPerformance('get_structure-cached', durationMs);
    expect(durationMs).toBeLessThan(50);
  });

  // P-4: get_section (iso32000-2, コールド)
  it('P-4: get_section iso32000-2 (コールド) < 1000ms', async () => {
    const { durationMs } = await withTiming(() =>
      toolHandlers.get_section({ section: '7.3.4', spec: 'iso32000-2' })
    );
    recordPerformance('get_section-cold', durationMs);
    expect(durationMs).toBeLessThan(1000);
  });

  // P-5: get_section (iso32000-2, キャッシュ)
  it('P-5: get_section iso32000-2 (キャッシュ) < 100ms', async () => {
    // P-4 でキャッシュ済み
    const { durationMs } = await withTiming(() =>
      toolHandlers.get_section({ section: '7.3.4', spec: 'iso32000-2' })
    );
    recordPerformance('get_section-cached', durationMs);
    expect(durationMs).toBeLessThan(100);
  });

  // P-6: search_spec (iso32000-2, コールド)
  it('P-6: search_spec iso32000-2 (コールド) < 15000ms', async () => {
    const { durationMs } = await withTiming(() =>
      toolHandlers.search_spec({ query: 'digital signature', spec: 'iso32000-2' })
    );
    recordPerformance('search_spec-cold', durationMs);
    expect(durationMs).toBeLessThan(15000);
  });

  // P-7: search_spec (iso32000-2, キャッシュ)
  it('P-7: search_spec iso32000-2 (キャッシュ) < 200ms', async () => {
    // P-6 でインデックス構築済み
    const { durationMs } = await withTiming(() =>
      toolHandlers.search_spec({ query: 'font', spec: 'iso32000-2' })
    );
    recordPerformance('search_spec-cached', durationMs);
    expect(durationMs).toBeLessThan(200);
  });

  // P-8: get_requirements (section 指定)
  it('P-8: get_requirements section="12.8" < 2000ms', async () => {
    const { durationMs } = await withTiming(() =>
      toolHandlers.get_requirements({ section: '12.8', spec: 'iso32000-2' })
    );
    recordPerformance('get_requirements-section', durationMs);
    expect(durationMs).toBeLessThan(2000);
  });

  // P-9: get_definitions (コールド)
  it('P-9: get_definitions (コールド) < 1000ms', async () => {
    const { durationMs } = await withTiming(() =>
      toolHandlers.get_definitions({ spec: 'iso32000-2' })
    );
    recordPerformance('get_definitions-cold', durationMs);
    expect(durationMs).toBeLessThan(1000);
  });

  // P-10: compare_versions (コールド)
  it('P-10: compare_versions (コールド) < 500ms', async () => {
    const { durationMs } = await withTiming(() => toolHandlers.compare_versions({}));
    recordPerformance('compare_versions-cold', durationMs);
    expect(durationMs).toBeLessThan(500);
  });

  // P-11: 全17仕様の get_structure 合計
  it('P-11: 全17仕様の get_structure 合計 < 30000ms', async () => {
    const { durationMs } = await withTiming(async () => {
      for (const specId of ALL_SPEC_IDS) {
        await toolHandlers.get_structure({ spec: specId });
      }
    });
    recordPerformance('get_structure-all-17', durationMs);
    expect(durationMs).toBeLessThan(30000);
  });
});
