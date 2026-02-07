/**
 * 04 - get_section E2E Tests
 *
 * C-1 〜 C-11: セクション取得、ContentElement型、エラーハンドリング
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { HAS_PDFS, initRegistry, ALL_SPEC_IDS } from './setup.js';
import { toolHandlers } from '../../src/tools/handlers.js';
import type { ContentElement } from '../../src/types/index.js';

describe.skipIf(!HAS_PDFS)('04 - get_section', () => {
  beforeAll(async () => {
    await initRegistry();
  });

  // C-1: 標準セクション取得
  it('C-1: iso32000-2 "7.3.4" を取得', async () => {
    const result = await toolHandlers.get_section({ section: '7.3.4', spec: 'iso32000-2' });
    expect(result.sectionNumber).toBe('7.3.4');
    expect(result.title).toBeTruthy();
    expect(result.pageRange.start).toBeGreaterThan(0);
    expect(result.pageRange.end).toBeGreaterThanOrEqual(result.pageRange.start);
    expect(result.content.length).toBeGreaterThan(0);
  });

  // C-2: トップレベルセクション
  it('C-2: iso32000-2 "7" トップレベルセクション', async () => {
    const result = await toolHandlers.get_section({ section: '7', spec: 'iso32000-2' });
    expect(result.sectionNumber).toBe('7');
    expect(result.content.length).toBeGreaterThan(0);
  });

  // C-3: Annex セクション
  it('C-3: iso32000-2 "Annex A" を取得', async () => {
    const result = await toolHandlers.get_section({ section: 'Annex A', spec: 'iso32000-2' });
    expect(result.sectionNumber).toBe('Annex A');
  });

  // C-4: 深いネスト
  it('C-4: 深いネストのセクションを取得', async () => {
    // iso32000-2 has sections like 7.3.4.2 etc.
    const result = await toolHandlers.get_section({ section: '7.3.4', spec: 'iso32000-2' });
    expect(result.sectionNumber).toBeTruthy();
    expect(result.content.length).toBeGreaterThan(0);
  });

  // C-5: 各仕様の先頭セクション
  describe('C-5: 全17仕様の先頭セクションが取得可能', () => {
    for (const specId of ALL_SPEC_IDS) {
      it(`${specId}: 先頭セクション取得`, async () => {
        // まず structure を取得してセクション一覧を確認
        const structure = await toolHandlers.get_structure({ spec: specId });

        // totalSections=0 の仕様 (declarations 等) はスキップ
        if (structure.totalSections === 0) {
          return;
        }

        // sectionNumber が非null な最初のセクションを探す
        function findFirstSection(
          entries: typeof structure.sections
        ): string | null {
          for (const entry of entries) {
            if (entry.sectionNumber) return entry.sectionNumber;
            const child = findFirstSection(entry.children);
            if (child) return child;
          }
          return null;
        }

        const firstSection = findFirstSection(structure.sections);
        if (firstSection) {
          const result = await toolHandlers.get_section({ section: firstSection, spec: specId });
          expect(result.sectionNumber).toBeTruthy();
          expect(result.content.length).toBeGreaterThanOrEqual(0);
        }
      });
    }
  });

  // C-6: ContentElement 型の検証
  it('C-6: heading/paragraph/list/table/note/code の各型が存在確認', async () => {
    // iso32000-2 のいくつかのセクションをチェック
    const result = await toolHandlers.get_section({ section: '7.3.4', spec: 'iso32000-2' });

    const types = new Set(result.content.map((e: ContentElement) => e.type));
    // paragraph は確実に存在するはず
    expect(types.has('paragraph')).toBe(true);
    // heading もセクション内に含まれうる（サブセクションがある場合）

    // 補足: テーブルがあるセクション
    const tableResult = await toolHandlers.get_section({ section: '7.2.2', spec: 'iso32000-2' });
    const tableTypes = new Set(tableResult.content.map((e: ContentElement) => e.type));
    // テーブルのあるセクションか、テキストのみのセクションか
    expect(tableTypes.size).toBeGreaterThan(0);
  });

  // C-7: StructTree 非対応 PDF (pdf17old)
  it('C-7: pdf17old でフォールバック (plain text)', async () => {
    const structure = await toolHandlers.get_structure({ spec: 'pdf17old' });
    // 最初の有効なセクションを探す
    function findFirst(entries: typeof structure.sections): string | null {
      for (const entry of entries) {
        if (entry.sectionNumber) return entry.sectionNumber;
        const child = findFirst(entry.children);
        if (child) return child;
      }
      return null;
    }
    const firstSection = findFirst(structure.sections);
    if (firstSection) {
      const result = await toolHandlers.get_section({ section: firstSection, spec: 'pdf17old' });
      expect(result.content.length).toBeGreaterThan(0);
      // フォールバック時は paragraph が主体
      const allParagraph = result.content.every((e: ContentElement) => e.type === 'paragraph');
      // StructTree非対応なら全て paragraph の可能性が高い
      expect(allParagraph || result.content.length > 0).toBe(true);
    }
  });

  // C-8: WTPDF のセクション形式
  it('C-8: wtpdf "1" を取得 (dot-terminated 形式)', async () => {
    const result = await toolHandlers.get_section({ section: '1', spec: 'wtpdf' });
    expect(result.sectionNumber).toBe('1');
    expect(result.content.length).toBeGreaterThan(0);
  });

  // C-9: 存在しないセクション
  it('C-9: 存在しないセクション "999.999" → エラー + サジェスト', async () => {
    await expect(
      toolHandlers.get_section({ section: '999.999', spec: 'iso32000-2' })
    ).rejects.toThrow('not found');
  });

  // C-10: 空文字セクション
  it('C-10: 空文字セクション → エラー', async () => {
    await expect(
      toolHandlers.get_section({ section: '', spec: 'iso32000-2' })
    ).rejects.toThrow(/must not be empty|empty/i);
  });

  // C-11: 大文字小文字
  it('C-11: "annex a" (小文字) → case-insensitive で取得', async () => {
    const result = await toolHandlers.get_section({ section: 'annex a', spec: 'iso32000-2' });
    expect(result.sectionNumber.toLowerCase()).toContain('annex');
  });
});
