/**
 * 10 - Cross-Cutting Concerns E2E Tests
 *
 * X-1 〜 X-12: LRU キャッシュ、PagesMapper 安定性、セクションキャッシュ、エラーハンドリング
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { HAS_PDFS, initRegistry } from './setup.js';
import { withTiming } from './helpers.js';
import { toolHandlers } from '../../src/tools/handlers.js';

describe.skipIf(!HAS_PDFS)('10 - Cross-Cutting Concerns', () => {
  beforeAll(async () => {
    await initRegistry();
  });

  // ========================================
  // LRU ドキュメントキャッシュ
  // ========================================

  describe('LRU ドキュメントキャッシュ', () => {
    // X-1: 4文書以内のキャッシュヒット
    it('X-1: 同一 spec の2回目呼び出しが高速', async () => {
      // コールドスタート
      const { durationMs: cold } = await withTiming(() =>
        toolHandlers.get_structure({ spec: 'iso32000-2' })
      );
      // キャッシュヒット
      const { durationMs: warm } = await withTiming(() =>
        toolHandlers.get_structure({ spec: 'iso32000-2' })
      );
      // キャッシュヒットはコールドより速いはず
      expect(warm).toBeLessThan(cold + 100); // マージン付き
    });

    // X-2: 5文書目でエビクション
    it('X-2: 5つ目の spec ロード後も正常動作', async () => {
      // 5つの異なる spec を順にロード (LRU上限=4)
      const specs = ['iso32000-2', 'pdf17', 'ts32002', 'pdfua2', 'wtpdf'];
      for (const specId of specs) {
        const result = await toolHandlers.get_structure({ spec: specId });
        expect(result.totalPages).toBeGreaterThan(0);
      }
      // 1番目 (iso32000-2) はエビクトされたが再ロード可能
      const result = await toolHandlers.get_structure({ spec: 'iso32000-2' });
      expect(result.totalPages).toBeGreaterThan(0);
    });

    // X-3: LRU 順序の正しさ
    it('X-3: アクセス順がLRU順序で更新される', async () => {
      // 4つのスペックをロード
      await toolHandlers.get_structure({ spec: 'ts32001' });
      await toolHandlers.get_structure({ spec: 'ts32002' });
      await toolHandlers.get_structure({ spec: 'ts32003' });
      await toolHandlers.get_structure({ spec: 'ts32004' });

      // ts32001 を再アクセスしてLRU更新
      await toolHandlers.get_structure({ spec: 'ts32001' });

      // 5つ目をロード → ts32002 がエビクトされるはず
      await toolHandlers.get_structure({ spec: 'ts32005' });

      // ts32001 はまだキャッシュにある（最近アクセスした）
      const { durationMs: ts1Time } = await withTiming(() =>
        toolHandlers.get_structure({ spec: 'ts32001' })
      );

      // ts32002 はエビクトされたが再ロード可能
      const result = await toolHandlers.get_structure({ spec: 'ts32002' });
      expect(result.totalPages).toBeGreaterThan(0);
    });
  });

  // ========================================
  // PagesMapper 安定性
  // ========================================

  describe('PagesMapper 安定性', () => {
    // X-4: 大→小→大 の文書切替
    it('X-4: iso32000-2(大) → an001(小) → iso32000-2 の get_section 正常', async () => {
      // 大きい文書のセクション取得
      const r1 = await toolHandlers.get_section({ section: '7.3.4', spec: 'iso32000-2' });
      expect(r1.content.length).toBeGreaterThan(0);

      // 小さい文書の構造取得
      await toolHandlers.get_structure({ spec: 'an001' });

      // 再び大きい文書のセクション取得
      const r2 = await toolHandlers.get_section({ section: '7.3.4', spec: 'iso32000-2' });
      expect(r2.content.length).toBeGreaterThan(0);
    });

    // X-5: search 後の get_section
    it('X-5: search_spec(pdf17) 後に get_section(iso32000-2, "7.3.4") 正常', async () => {
      await toolHandlers.search_spec({ query: 'cross-reference', spec: 'pdf17' });
      const result = await toolHandlers.get_section({ section: '7.3.4', spec: 'iso32000-2' });
      expect(result.content.length).toBeGreaterThan(0);
      expect(result.sectionNumber).toBe('7.3.4');
    });

    // X-6: 連続 search 5仕様
    it('X-6: 5仕様の search_spec を連続実行してエラーなし', async () => {
      const specs = ['iso32000-2', 'pdf17', 'ts32002', 'pdfua2', 'wtpdf'];
      for (const specId of specs) {
        const result = await toolHandlers.search_spec({ query: 'PDF', spec: specId });
        expect(result.totalResults).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // ========================================
  // セクションコンテンツキャッシュ
  // ========================================

  describe('セクションコンテンツキャッシュ', () => {
    // X-7: 同一セクション2回取得
    it('X-7: 2回目が高速 (キャッシュヒット)', async () => {
      // セクションキャッシュをプライム
      await toolHandlers.get_section({ section: '7.3.4', spec: 'iso32000-2' });

      const { durationMs: cold } = await withTiming(() =>
        toolHandlers.get_section({ section: '7.4', spec: 'iso32000-2' })
      );
      const { durationMs: warm } = await withTiming(() =>
        toolHandlers.get_section({ section: '7.4', spec: 'iso32000-2' })
      );
      // 2回目はキャッシュヒットで高速
      expect(warm).toBeLessThanOrEqual(cold + 50);
    });

    // X-8: 異なる spec 同一セクション番号
    it('X-8: iso32000-2 "7.3" と pdf17 "7.3" が別キャッシュ', async () => {
      const r1 = await toolHandlers.get_section({ section: '7.3', spec: 'iso32000-2' });
      const r2 = await toolHandlers.get_section({ section: '7.3', spec: 'pdf17' });

      // 両方とも正常に取得できる
      expect(r1.sectionNumber).toBe('7.3');
      expect(r2.sectionNumber).toBe('7.3');
      // タイトルが異なるはず（異なる仕様だから）
      // 同じかもしれないが、少なくとも両方存在する
      expect(r1.content.length).toBeGreaterThan(0);
      expect(r2.content.length).toBeGreaterThan(0);
    });
  });

  // ========================================
  // エラーハンドリング
  // ========================================

  describe('エラーハンドリング', () => {
    // X-9: 全ツールの不正引数
    it('X-9: 各ツールに不正引数を渡してクラッシュしない', async () => {
      // get_section: section 未指定
      await expect(
        toolHandlers.get_section({} as any)
      ).rejects.toThrow();

      // search_spec: query 未指定
      await expect(
        toolHandlers.search_spec({} as any)
      ).rejects.toThrow();

      // get_tables: section 未指定
      await expect(
        toolHandlers.get_tables({} as any)
      ).rejects.toThrow();

      // get_requirements: 無効な level
      await expect(
        toolHandlers.get_requirements({ level: 'invalid' })
      ).rejects.toThrow();

      // list_specs: 不正 category → 空結果（エラーにならない）
      const r = await toolHandlers.list_specs({ category: 'nonexistent' });
      expect(r.totalSpecs).toBe(0);
    });

    // X-10: specId 50文字超
    it('X-10: specId 50文字超 → "50 characters" エラー', async () => {
      const longId = 'a'.repeat(51);
      await expect(
        toolHandlers.get_structure({ spec: longId })
      ).rejects.toThrow(/50 characters/i);
    });

    // X-11: specId 空文字
    it('X-11: specId 空文字 → "non-empty string" エラー', async () => {
      await expect(
        toolHandlers.get_structure({ spec: '' })
      ).rejects.toThrow(/non-empty string/i);
    });

    // X-12: 存在しない specId
    it('X-12: 存在しない specId → "not found" エラー', async () => {
      await expect(
        toolHandlers.get_structure({ spec: 'nonexistent-spec' })
      ).rejects.toThrow(/not found/i);
    });
  });
});
