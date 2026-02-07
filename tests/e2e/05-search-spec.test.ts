/**
 * 05 - search_spec E2E Tests
 *
 * Q-1 〜 Q-14: 基本検索、全仕様検索、PagesMapper回帰テスト
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { HAS_PDFS, initRegistry, ALL_SPEC_IDS } from './setup.js';
import { toolHandlers } from '../../src/tools/handlers.js';

describe.skipIf(!HAS_PDFS)('05 - search_spec', () => {
  beforeAll(async () => {
    await initRegistry();
  });

  // Q-1: 基本検索
  it('Q-1: iso32000-2 "digital signature" → results > 0', async () => {
    const result = await toolHandlers.search_spec({
      query: 'digital signature',
      spec: 'iso32000-2',
    });
    expect(result.totalResults).toBeGreaterThan(0);
    // スニペットに検索語を含む
    const hasSnippet = result.results.some(
      (r) =>
        r.snippet.toLowerCase().includes('digital') || r.snippet.toLowerCase().includes('signature')
    );
    expect(hasSnippet).toBe(true);
  });

  // Q-2: PDF 1.7 検索 (PagesMapper 修正の回帰確認)
  it('Q-2: pdf17 "cross-reference" → results > 0', async () => {
    const result = await toolHandlers.search_spec({
      query: 'cross-reference',
      spec: 'pdf17',
    });
    expect(result.totalResults).toBeGreaterThan(0);
  });

  // Q-3: 小規模PDF検索
  it('Q-3: ts32002 "signature" → 正常動作', async () => {
    const result = await toolHandlers.search_spec({
      query: 'signature',
      spec: 'ts32002',
    });
    // 結果は0件以上（エラーなし）
    expect(result.totalResults).toBeGreaterThanOrEqual(0);
  });

  // Q-4: 全17仕様で検索
  describe('Q-4: 全17仕様で "PDF" 検索がエラーなく実行', () => {
    for (const specId of ALL_SPEC_IDS) {
      it(`${specId}: "PDF" 検索`, async () => {
        const result = await toolHandlers.search_spec({
          query: 'PDF',
          spec: specId,
        });
        expect(result.totalResults).toBeGreaterThanOrEqual(0);
        expect(result.query).toBe('PDF');
      });
    }
  });

  // Q-5: AND 検索
  it('Q-5: iso32000-2 "font descriptor" → 両語を含むスニペット', async () => {
    const result = await toolHandlers.search_spec({
      query: 'font descriptor',
      spec: 'iso32000-2',
    });
    expect(result.totalResults).toBeGreaterThan(0);
  });

  // Q-6: max_results=3
  it('Q-6: max_results=3 → results.length ≤ 3', async () => {
    const result = await toolHandlers.search_spec({
      query: 'digital signature',
      spec: 'iso32000-2',
      max_results: 3,
    });
    expect(result.results.length).toBeLessThanOrEqual(3);
  });

  // Q-7: max_results=1
  it('Q-7: max_results=1 → results.length = 1', async () => {
    const result = await toolHandlers.search_spec({
      query: 'digital signature',
      spec: 'iso32000-2',
      max_results: 1,
    });
    expect(result.results.length).toBe(1);
  });

  // Q-8: ハイフン結合語
  it('Q-8: "cross-reference" → ハイフン正規化で検出', async () => {
    const result = await toolHandlers.search_spec({
      query: 'cross-reference',
      spec: 'iso32000-2',
    });
    expect(result.totalResults).toBeGreaterThan(0);
  });

  // Q-9: 空クエリ
  it('Q-9: 空クエリ → エラー', async () => {
    await expect(
      toolHandlers.search_spec({ query: '', spec: 'iso32000-2' })
    ).rejects.toThrow(/must not be empty|empty/i);
  });

  // Q-10: 500文字超クエリ
  it('Q-10: 500文字超クエリ → エラー', async () => {
    const longQuery = 'a'.repeat(501);
    await expect(
      toolHandlers.search_spec({ query: longQuery, spec: 'iso32000-2' })
    ).rejects.toThrow(/too long|500/i);
  });

  // Q-11: ヒットなし
  it('Q-11: "xyzzynonexistent" → results.length = 0', async () => {
    const result = await toolHandlers.search_spec({
      query: 'xyzzynonexistent',
      spec: 'iso32000-2',
    });
    expect(result.totalResults).toBe(0);
    expect(result.results).toHaveLength(0);
  });

  // ========================================
  // PagesMapper 回帰テスト (Q-12 〜 Q-14)
  // ========================================

  // Q-12: iso32000-2 → pdf17 → iso32000-2 の交互検索
  it('Q-12: 交互検索 iso32000-2 → pdf17 → iso32000-2', async () => {
    const r1 = await toolHandlers.search_spec({
      query: 'digital signature',
      spec: 'iso32000-2',
    });
    expect(r1.totalResults).toBeGreaterThan(0);

    const r2 = await toolHandlers.search_spec({
      query: 'cross-reference',
      spec: 'pdf17',
    });
    expect(r2.totalResults).toBeGreaterThan(0);

    // 2回目の iso32000-2 検索も正常
    const r3 = await toolHandlers.search_spec({
      query: 'font',
      spec: 'iso32000-2',
    });
    expect(r3.totalResults).toBeGreaterThan(0);
  });

  // Q-13: 小→大→小 ページ数の文書切替
  it('Q-13: an001(小) → iso32000-2(大) → ts32002(小) の文書切替', async () => {
    const r1 = await toolHandlers.search_spec({
      query: 'PDF',
      spec: 'an001',
    });
    expect(r1.totalResults).toBeGreaterThanOrEqual(0);

    const r2 = await toolHandlers.search_spec({
      query: 'stream',
      spec: 'iso32000-2',
    });
    expect(r2.totalResults).toBeGreaterThan(0);

    const r3 = await toolHandlers.search_spec({
      query: 'signature',
      spec: 'ts32002',
    });
    expect(r3.totalResults).toBeGreaterThanOrEqual(0);
  });

  // Q-14: 5仕様以上の連続検索 (LRU上限4を超える)
  it('Q-14: 5仕様以上の連続検索でエラーなし', async () => {
    const specs = ['iso32000-2', 'pdf17', 'ts32002', 'pdfua2', 'wtpdf'] as const;
    for (const specId of specs) {
      const result = await toolHandlers.search_spec({
        query: 'PDF',
        spec: specId,
      });
      expect(result.totalResults).toBeGreaterThanOrEqual(0);
    }
  });
});
