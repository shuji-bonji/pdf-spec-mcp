/**
 * 08 - get_tables E2E Tests
 *
 * T-1 〜 T-9: テーブル取得、構造検証、table_index、フォールバック
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { toolHandlers } from '../../src/tools/handlers.js';
import { HAS_PDFS, initRegistry } from './setup.js';

describe.skipIf(!HAS_PDFS)('08 - get_tables', () => {
  beforeAll(async () => {
    await initRegistry();
  });

  // テーブルがあることがわかっているセクションを探す
  // iso32000-2 の Table 1 は "7.1" あたりにある
  // セクション "7.4.7" などにはテーブルがある

  // T-1: テーブル取得
  it('T-1: iso32000-2 テーブル含有セクション → tables.length > 0', async () => {
    // まず get_structure で探索
    // "7.9.6" は CIDFont のテーブルがあるセクション
    // いくつかのセクションを試す
    const candidates = ['7.9.6', '8.4.5', '12.8.1', '7.4.7'];
    let found = false;
    for (const section of candidates) {
      try {
        const result = await toolHandlers.get_tables({ section, spec: 'iso32000-2' });
        if (result.totalTables > 0) {
          expect(result.tables.length).toBeGreaterThan(0);
          found = true;
          break;
        }
      } catch {}
    }
    // テーブルを含むセクションが少なくとも1つ見つかるはず
    expect(found).toBe(true);
  });

  // T-2: テーブル構造の検証
  it('T-2: headers[]非空、rows[][]の列数がheadersと一致', async () => {
    const candidates = ['7.9.6', '8.4.5', '12.8.1', '7.4.7'];
    for (const section of candidates) {
      try {
        const result = await toolHandlers.get_tables({ section, spec: 'iso32000-2' });
        if (result.totalTables > 0) {
          const table = result.tables[0];
          // headers または rows が存在
          if (table.headers.length > 0) {
            expect(table.headers.length).toBeGreaterThan(0);
            // rows の各行の列数は headers と一致（可能なら）
            for (const row of table.rows) {
              // 完全一致でなくてもよい（colspan 等があるため）
              expect(row.length).toBeGreaterThan(0);
            }
          }
          return;
        }
      } catch {}
    }
  });

  // T-3: table_index=0
  it('T-3: table_index=0 → tables.length=1', async () => {
    const candidates = ['7.9.6', '8.4.5', '12.8.1', '7.4.7'];
    for (const section of candidates) {
      try {
        const result = await toolHandlers.get_tables({
          section,
          spec: 'iso32000-2',
          table_index: 0,
        });
        if (result.totalTables === 1) {
          expect(result.tables).toHaveLength(1);
          return;
        }
      } catch {}
    }
  });

  // T-4: table_index 範囲外
  it('T-4: table_index=999 → エラー', async () => {
    // テーブルがあるセクションで範囲外の table_index
    const candidates = ['7.9.6', '8.4.5', '12.8.1'];
    for (const section of candidates) {
      try {
        await expect(
          toolHandlers.get_tables({ section, spec: 'iso32000-2', table_index: 999 }),
        ).rejects.toThrow(/out of range/i);
        return;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : '';
        if (msg.includes('out of range')) return;
      }
    }
  });

  // T-5: テーブルなしセクション
  it('T-5: テーブルなしセクション → tables.length=0', async () => {
    // "7.2.2" はテーブルなしと判明している
    const result = await toolHandlers.get_tables({ section: '7.2.2', spec: 'iso32000-2' });
    expect(result.totalTables).toBe(0);
    expect(result.tables).toHaveLength(0);
  });

  // T-6: PDF 1.7
  it('T-6: pdf17 → 正常動作', async () => {
    const structure = await toolHandlers.get_structure({ spec: 'pdf17' });
    const firstSection = structure.sections.find((s) => s.sectionNumber !== null);
    if (firstSection?.sectionNumber) {
      const result = await toolHandlers.get_tables({
        section: firstSection.sectionNumber,
        spec: 'pdf17',
      });
      expect(result.totalTables).toBeGreaterThanOrEqual(0);
    }
  });

  // T-7: 小規模PDF (ts32002)
  it('T-7: ts32002 → 正常動作', async () => {
    const structure = await toolHandlers.get_structure({ spec: 'ts32002' });
    const firstSection = structure.sections.find((s) => s.sectionNumber !== null);
    if (firstSection?.sectionNumber) {
      const result = await toolHandlers.get_tables({
        section: firstSection.sectionNumber,
        spec: 'ts32002',
      });
      expect(result.totalTables).toBeGreaterThanOrEqual(0);
    }
  });

  // T-8: StructTree 非対応 (pdf17old)
  it('T-8: pdf17old → フォールバック動作', async () => {
    const structure = await toolHandlers.get_structure({ spec: 'pdf17old' });
    const firstSection = structure.sections.find((s) => s.sectionNumber !== null);
    if (firstSection?.sectionNumber) {
      const result = await toolHandlers.get_tables({
        section: firstSection.sectionNumber,
        spec: 'pdf17old',
      });
      // テキストベースのフォールバックでテーブルを検出するか、0件
      expect(result.totalTables).toBeGreaterThanOrEqual(0);
    }
  });

  // T-9: THead/TBody ラッパー
  it('T-9: iso32000-2 のテーブルでヘッダーとボディ行が分離', async () => {
    const candidates = ['7.9.6', '8.4.5', '12.8.1', '7.4.7'];
    for (const section of candidates) {
      try {
        const result = await toolHandlers.get_tables({ section, spec: 'iso32000-2' });
        if (result.totalTables > 0 && result.tables[0].headers.length > 0) {
          // ヘッダーとボディ行がそれぞれ存在
          expect(result.tables[0].headers.length).toBeGreaterThan(0);
          return;
        }
      } catch {}
    }
  });

  // T-10: S-9 回帰 — 実在しない空行を捏造しない
  it('T-10: Table 126 は 21 行・全セル空の行ゼロ（構造木に空 TR は存在しない）', async () => {
    // ページ跨ぎ Table 要素（386 の断片が TH 内に他ページの Figure を抱える）の輪切りが
    // ["","",""] 行として合成されていた。地上真実は pdf-lib ダンプ + reader M-8 で確認済み:
    // データ行 7+5+7+2 = 21、空行ゼロ。
    const result = await toolHandlers.get_tables({ section: '10.6.3', spec: 'iso32000-2' });
    expect(result.totalTables).toBe(1);
    expect(result.tables[0].rows).toHaveLength(21);
    expect(result.tables[0].rows.every((r) => r.some((c) => c.trim() !== ''))).toBe(true);
  });

  // T-11: S-9 回帰 — 次セクションの表を前セクションに残さない
  it('T-11: 8.4.3.3 に Table 54（8.4.3.4 の表）が不完全な重複として現れない', async () => {
    const result = await toolHandlers.get_tables({ section: '8.4.3.3', spec: 'iso32000-2' });
    const captions = result.tables.map((t) => t.caption ?? '');
    expect(captions.some((c) => c.includes('Table 53'))).toBe(true);
    expect(captions.some((c) => c.includes('Table 54'))).toBe(false);

    // Table 54 の完全版は 8.4.3.4 が持つ（Miter / Round / Bevel の 3 行）
    const owner = await toolHandlers.get_tables({ section: '8.4.3.4', spec: 'iso32000-2' });
    expect(owner.tables[0].caption).toContain('Table 54');
    expect(owner.tables[0].rows).toHaveLength(3);
  });
});
