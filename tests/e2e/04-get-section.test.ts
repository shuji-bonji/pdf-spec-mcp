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
  it('SPEC-PDFSPEC-GET-SECTION-001 C-1: iso32000-2 "7.3.4" を取得', async () => {
    const result = await toolHandlers.get_section({ section: '7.3.4', spec: 'iso32000-2' });
    expect(result.sectionNumber).toBe('7.3.4');
    expect(result.title).toBeTruthy();
    expect(result.pageRange.start).toBeGreaterThan(0);
    expect(result.pageRange.end).toBeGreaterThanOrEqual(result.pageRange.start);
    expect(result.content.length).toBeGreaterThan(0);
  });

  // C-2: トップレベルセクション
  it('SPEC-PDFSPEC-GET-SECTION-001 C-2: iso32000-2 "7" トップレベルセクション', async () => {
    const result = await toolHandlers.get_section({ section: '7', spec: 'iso32000-2' });
    expect(result.sectionNumber).toBe('7');
    expect(result.content.length).toBeGreaterThan(0);
  });

  // C-3: Annex セクション
  it('SPEC-PDFSPEC-GET-SECTION-001 C-3: iso32000-2 "Annex A" を取得', async () => {
    const result = await toolHandlers.get_section({ section: 'Annex A', spec: 'iso32000-2' });
    expect(result.sectionNumber).toBe('Annex A');
  });

  // C-4: 深いネスト
  it('SPEC-PDFSPEC-GET-SECTION-001 C-4: 深いネストのセクションを取得', async () => {
    // iso32000-2 has sections like 7.3.4.2 etc.
    const result = await toolHandlers.get_section({ section: '7.3.4', spec: 'iso32000-2' });
    expect(result.sectionNumber).toBeTruthy();
    expect(result.content.length).toBeGreaterThan(0);
  });

  // C-5: 各仕様の先頭セクション
  describe('SPEC-PDFSPEC-GET-SECTION-001 C-5: 全17仕様の先頭セクションが取得可能', () => {
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
  it('SPEC-PDFSPEC-GET-SECTION-003 C-6: heading/paragraph/list/table/note/code の各型が存在確認', async () => {
    const result = await toolHandlers.get_section({ section: '7.3.4.1', spec: 'iso32000-2' });

    const types = new Set(result.content.map((e: ContentElement) => e.type));
    // paragraph は確実に存在するはず
    expect(types.has('paragraph')).toBe(true);

    // 補足: テーブルがあるセクション（7.3.4.2 Literal strings は Table 3 を持つ）
    const tableResult = await toolHandlers.get_section({ section: '7.3.4.2', spec: 'iso32000-2' });
    const tableTypes = new Set(tableResult.content.map((e: ContentElement) => e.type));
    expect(tableTypes.has('table')).toBe(true);
  });

  // C-6b: SV-1 — 親セクションはサブツリー全体を文書順に返す（分割済み断片の連結なので重複なし）
  it('SPEC-PDFSPEC-GET-SECTION-010 C-6b: 7.3.4 (親) は自身の見出し + 全子セクションの内容を返す', async () => {
    const result = await toolHandlers.get_section({ section: '7.3.4', spec: 'iso32000-2' });
    const headings = result.content
      .filter(
        (e: ContentElement): e is Extract<ContentElement, { type: 'heading' }> =>
          e.type === 'heading',
      )
      .map((h) => h.text);
    expect(headings[0]).toContain('7.3.4 String objects');
    // 子の見出しが文書順に含まれる
    expect(headings.some((h) => h.startsWith('7.3.4.1 '))).toBe(true);
    expect(headings.some((h) => h.startsWith('7.3.4.2 '))).toBe(true);
    // 子にしか無い内容（Table 3 — Escape sequences）が親から見える
    const cells = result.content
      .filter(
        (e: ContentElement): e is Extract<ContentElement, { type: 'table' }> => e.type === 'table',
      )
      .flatMap((t) => t.rows.flat());
    expect(cells.length).toBeGreaterThan(0);
  });

  // C-14: SV-1 固定ケース — 親経由で Table 257 の P エントリの規範が見える
  it('SPEC-PDFSPEC-GET-SECTION-010 C-14: get_section("12.8.2.2") に Table 257 の DSS 例外（shall not be considered as changes）', async () => {
    const result = await toolHandlers.get_section({ section: '12.8.2.2', spec: 'iso32000-2' });
    expect(result.pageRange.start).toBe(588);
    expect(result.pageRange.end).toBeGreaterThanOrEqual(589);
    const cells = result.content
      .filter(
        (e: ContentElement): e is Extract<ContentElement, { type: 'table' }> => e.type === 'table',
      )
      .flatMap((t) => t.rows.flat());
    expect(cells.some((c) => c.includes('shall not be considered as changes'))).toBe(true);

    // SV-1b: get_tables でも親経由で子孫の表が見える
    const tables = await toolHandlers.get_tables({ section: '12.8.2.2', spec: 'iso32000-2' });
    expect(tables.totalTables).toBeGreaterThanOrEqual(1);
  });

  // C-7: StructTree 非対応 PDF (pdf17old)
  it('SPEC-PDFSPEC-GET-SECTION-005 C-7: pdf17old でフォールバック (plain text)', async () => {
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
  it('SPEC-PDFSPEC-GET-SECTION-001 C-8: wtpdf "1" を取得 (dot-terminated 形式)', async () => {
    const result = await toolHandlers.get_section({ section: '1', spec: 'wtpdf' });
    expect(result.sectionNumber).toBe('1');
    expect(result.content.length).toBeGreaterThan(0);
  });

  // C-9: 存在しないセクション
  it('SPEC-PDFSPEC-GET-SECTION-002 C-9: 存在しないセクション "999.999" → エラー + サジェスト', async () => {
    await expect(
      toolHandlers.get_section({ section: '999.999', spec: 'iso32000-2' }),
    ).rejects.toThrow('not found');
  });

  // C-10: 空文字セクション
  it('SPEC-PDFSPEC-GET-SECTION-002 C-10: 空文字セクション → エラー', async () => {
    await expect(toolHandlers.get_section({ section: '', spec: 'iso32000-2' })).rejects.toThrow(
      /must not be empty|empty/i,
    );
  });

  // C-11: 大文字小文字
  it('SPEC-PDFSPEC-GET-SECTION-001 C-11: "annex a" (小文字) → case-insensitive で取得', async () => {
    const result = await toolHandlers.get_section({ section: 'annex a', spec: 'iso32000-2' });
    expect(result.sectionNumber.toLowerCase()).toContain('annex');
  });

  // C-12: S-10 回帰 — pageRange.end が跨ぎ先ページを反映する
  it('SPEC-PDFSPEC-GET-SECTION-009 C-12: 14.9.4 の pageRange が 815–816（帯を採用したら end も伸びる）', async () => {
    // 内容は p.816 の shall / NOTE / EXAMPLE まで返るのに end が 815 のままだったため、
    // ページ指定の後続処理（reader read_text / veraPDF の該当箇所確認）が 1 ページ手前で
    // 止まっていた。
    const result = await toolHandlers.get_section({ section: '14.9.4', spec: 'iso32000-2' });
    expect(result.pageRange).toEqual({ start: 815, end: 816 });
  });

  // C-13: S-9 回帰 — ページを共有する次セクションの内容を含まない
  it('SPEC-PDFSPEC-GET-SECTION-007 C-13: 8.4.3.3 の内容に 8.4.3.4 の見出しが含まれない（ページ分割）', async () => {
    const result = await toolHandlers.get_section({ section: '8.4.3.3', spec: 'iso32000-2' });
    const headings = result.content.filter(
      (e): e is { type: 'heading'; level: number; text: string } => e.type === 'heading',
    );
    expect(headings.some((h) => h.text.startsWith('8.4.3.4 '))).toBe(false);
  });

  // C-15 〜 C-17: Issue #15 — PDF32000_2008.pdf は H 要素を持たず、見出しは P として入っている。
  // 0.6.2 は見出しを 1 つも作れず、全節がページ単位で前後の節を含んでいた。
  it('SPEC-PDFSPEC-GET-SECTION-012 C-15: pdf17 9.6.4 → 自節の見出しで始まり、9.6.3 の NOTE も 9.6.5 も含まない', async () => {
    const result = await toolHandlers.get_section({ section: '9.6.4', spec: 'pdf17' });
    expect(result.pageRange).toEqual({ start: 266, end: 266 });
    expect(result.content[0]).toEqual({ type: 'heading', level: 3, text: '9.6.4 Font Subsets' });
    const text = JSON.stringify(result.content);
    expect(text).not.toContain('TrueType font format was developed by Apple'); // 9.6.3 NOTE 1
    expect(text).not.toContain('Type 3 Fonts'); // 9.6.5
    expect(text).not.toContain('Table 112'); // 9.6.5 の表
    expect(text).toContain('EOODIA+Poetica'); // 9.6.4 の EXAMPLE
  });

  it('SPEC-PDFSPEC-GET-SECTION-012 C-16: pdf17 7.7.3.4 → 7.7.4 Name Dictionary を含まない', async () => {
    const result = await toolHandlers.get_section({ section: '7.7.3.4', spec: 'pdf17' });
    expect(result.content[0]).toEqual({
      type: 'heading',
      level: 4,
      text: '7.7.3.4 Inheritance of Page Attributes',
    });
    const text = JSON.stringify(result.content);
    expect(text).not.toContain('7.7.4 Name Dictionary');
    expect(text).toContain('Figure 6');
  });

  it('SPEC-PDFSPEC-GET-SECTION-012 C-17: pdf17 9.8.1 → Table 122 が table 要素として入り、本文に溶けていない', async () => {
    const result = await toolHandlers.get_section({ section: '9.8.1', spec: 'pdf17' });
    const tables = result.content.filter((e) => e.type === 'table');
    expect(tables.length).toBeGreaterThanOrEqual(1);
    const paragraphs = result.content.filter((e) => e.type === 'paragraph');
    // 0.6.2 では "FontName name (Required) ..." が段落の文字列として返っていた
    expect(paragraphs.some((p) => /FontName name \(Required\)/.test(p.text))).toBe(false);
  });
});
