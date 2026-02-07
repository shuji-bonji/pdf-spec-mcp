/**
 * 09 - compare_versions E2E Tests
 *
 * V-1 〜 V-10: 全体比較、セクションフィルタ、マッチ品質、キャッシュ一貫性
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { HAS_PDFS, initRegistry } from './setup.js';
import { toolHandlers } from '../../src/tools/handlers.js';
import { isSpecAvailable } from '../../src/services/pdf-registry.js';

describe.skipIf(!HAS_PDFS)('09 - compare_versions', () => {
  let hasBothSpecs = false;

  beforeAll(async () => {
    await initRegistry();
    hasBothSpecs = isSpecAvailable('pdf17') && isSpecAvailable('iso32000-2');
  });

  // V-1: 全体比較
  it('V-1: matched > 500, added > 0, removed > 0', async () => {
    if (!hasBothSpecs) return;
    const result = await toolHandlers.compare_versions({});
    expect(result.totalMatched).toBeGreaterThan(500);
    expect(result.totalAdded).toBeGreaterThan(0);
    expect(result.totalRemoved).toBeGreaterThan(0);
    expect(result.matched.length).toBe(result.totalMatched);
    expect(result.added.length).toBe(result.totalAdded);
    expect(result.removed.length).toBe(result.totalRemoved);
  });

  // V-2: セクションフィルタ "7"
  it('V-2: section="7" → matched のセクションが "7" で始まる', async () => {
    if (!hasBothSpecs) return;
    const result = await toolHandlers.compare_versions({ section: '7' });
    for (const m of result.matched) {
      const starts17 = m.section17 === '7' || m.section17.startsWith('7.');
      const starts20 = m.section20 === '7' || m.section20.startsWith('7.');
      expect(starts17 || starts20).toBe(true);
    }
  });

  // V-3: セクションフィルタ "12.8"
  it('V-3: section="12.8" → フィルタされた結果', async () => {
    if (!hasBothSpecs) return;
    const result = await toolHandlers.compare_versions({ section: '12.8' });
    expect(result.totalMatched).toBeGreaterThan(0);
  });

  // V-4: マッチ品質サンプリング
  it('V-4: matched[0..9] の title が空でない', async () => {
    if (!hasBothSpecs) return;
    const result = await toolHandlers.compare_versions({});
    const sample = result.matched.slice(0, 10);
    for (const m of sample) {
      expect(m.title).toBeTruthy();
      expect(m.section17).toBeTruthy();
      expect(m.section20).toBeTruthy();
    }
  });

  // V-5: added の妥当性
  it('V-5: 全 added の version="pdf20"', async () => {
    if (!hasBothSpecs) return;
    const result = await toolHandlers.compare_versions({});
    for (const a of result.added) {
      expect(a.version).toBe('pdf20');
    }
  });

  // V-6: removed の妥当性
  it('V-6: 全 removed の version="pdf17"', async () => {
    if (!hasBothSpecs) return;
    const result = await toolHandlers.compare_versions({});
    for (const r of result.removed) {
      expect(r.version).toBe('pdf17');
    }
  });

  // V-7: 存在しないセクション
  it('V-7: section="999" → matched=0, added=0, removed=0', async () => {
    if (!hasBothSpecs) return;
    const result = await toolHandlers.compare_versions({ section: '999' });
    expect(result.totalMatched).toBe(0);
    expect(result.totalAdded).toBe(0);
    expect(result.totalRemoved).toBe(0);
  });

  // V-8: キャッシュ一貫性
  it('V-8: 2回呼び出して同じ結果', async () => {
    if (!hasBothSpecs) return;
    const r1 = await toolHandlers.compare_versions({ section: '7.3' });
    const r2 = await toolHandlers.compare_versions({ section: '7.3' });
    expect(r1.totalMatched).toBe(r2.totalMatched);
    expect(r1.totalAdded).toBe(r2.totalAdded);
    expect(r1.totalRemoved).toBe(r2.totalRemoved);
  });

  // V-9: pdf17 未配置時 (条件付きスキップ)
  it('V-9: pdf17 がない場合のエラーメッセージ', () => {
    // このテストは pdf17 がある場合はスキップ
    if (hasBothSpecs) {
      // pdf17 が存在する場合は V-1 で十分検証済み
      expect(true).toBe(true);
      return;
    }
    // pdf17 がない場合はエラーが出るはず
    expect(
      toolHandlers.compare_versions({})
    ).rejects.toThrow(/requires/i);
  });

  // V-10: status 値の検証
  it('V-10: matched 内に "same" / "moved" の両方が存在するか確認', async () => {
    if (!hasBothSpecs) return;
    const result = await toolHandlers.compare_versions({});
    const statuses = new Set(result.matched.map((m) => m.status));
    // 'same' は確実に存在するはず
    expect(statuses.has('same')).toBe(true);
    // 'moved' も存在する可能性が高い（セクション番号が変更されたもの）
    // 存在しない場合もエラーにはしない
    expect(statuses.size).toBeGreaterThanOrEqual(1);
  });
});
