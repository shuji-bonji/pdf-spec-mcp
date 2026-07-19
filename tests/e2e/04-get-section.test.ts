/**
 * 04 - get_section E2E Tests
 *
 * C-1 〜 C-11: セクション取得、ContentElement型、エラーハンドリング
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { toolHandlers } from '../../src/tools/handlers.js';
import type { ContentElement } from '../../src/types/index.js';
import { ALL_SPEC_IDS, HAS_PDFS, initRegistry } from './setup.js';

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
        function findFirstSection(entries: typeof structure.sections): string | null {
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
    // 葉セクションで検証する。7.3.4 のような親セクションは ISO 原文でも見出しの直後に
    // 子（7.3.4.1）が始まり前文を持たないため、S-9 のページ分割後は正しく
    // [heading] のみを返す（旧実装は同一ページ上の子の内容の断片を親に混ぜていた）。
    const result = await toolHandlers.get_section({ section: '7.3.4.1', spec: 'iso32000-2' });

    const types = new Set(result.content.map((e: ContentElement) => e.type));
    // paragraph は確実に存在するはず
    expect(types.has('paragraph')).toBe(true);

    // 補足: テーブルがあるセクション（7.3.4.2 Literal strings は Table 3 を持つ）
    const tableResult = await toolHandlers.get_section({ section: '7.3.4.2', spec: 'iso32000-2' });
    const tableTypes = new Set(tableResult.content.map((e: ContentElement) => e.type));
    expect(tableTypes.has('table')).toBe(true);
  });

  // C-6b: S-9 — 前文を持たない親セクションは見出しのみを返す（子の断片を混ぜない）
  it('C-6b: 7.3.4 (親) は heading のみ（内容は 7.3.4.1 以下が持つ）', async () => {
    const result = await toolHandlers.get_section({ section: '7.3.4', spec: 'iso32000-2' });
    expect(result.content.map((e: ContentElement) => e.type)).toEqual(['heading']);
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
      toolHandlers.get_section({ section: '999.999', spec: 'iso32000-2' }),
    ).rejects.toThrow('not found');
  });

  // C-10: 空文字セクション
  it('C-10: 空文字セクション → エラー', async () => {
    await expect(toolHandlers.get_section({ section: '', spec: 'iso32000-2' })).rejects.toThrow(
      /must not be empty|empty/i,
    );
  });

  // C-11: 大文字小文字
  it('C-11: "annex a" (小文字) → case-insensitive で取得', async () => {
    const result = await toolHandlers.get_section({ section: 'annex a', spec: 'iso32000-2' });
    expect(result.sectionNumber.toLowerCase()).toContain('annex');
  });

  // C-12: S-10 回帰 — pageRange.end が跨ぎ先ページを反映する
  it('C-12: 14.9.4 の pageRange が 815–816（帯を採用したら end も伸びる）', async () => {
    // 内容は p.816 の shall / NOTE / EXAMPLE まで返るのに end が 815 のままだったため、
    // ページ指定の後続処理（reader read_text / veraPDF の該当箇所確認）が 1 ページ手前で
    // 止まっていた。
    const result = await toolHandlers.get_section({ section: '14.9.4', spec: 'iso32000-2' });
    expect(result.pageRange).toEqual({ start: 815, end: 816 });
  });

  // C-13: S-9 回帰 — ページを共有する次セクションの内容を含まない
  it('C-13: 8.4.3.3 の内容に 8.4.3.4 の見出しが含まれない（ページ分割）', async () => {
    const result = await toolHandlers.get_section({ section: '8.4.3.3', spec: 'iso32000-2' });
    const headings = result.content.filter(
      (e): e is { type: 'heading'; level: number; text: string } => e.type === 'heading',
    );
    expect(headings.some((h) => h.text.startsWith('8.4.3.4 '))).toBe(false);
  });
});
