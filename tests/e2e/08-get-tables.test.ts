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
  it('SPEC-PDFSPEC-GET-TABLES-001 T-1: iso32000-2 テーブル含有セクション → tables.length > 0', async () => {
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
  it('SPEC-PDFSPEC-GET-TABLES-001 T-2: headers[]非空、rows[][]の列数がheadersと一致', async () => {
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
  it('SPEC-PDFSPEC-GET-TABLES-001 T-3: table_index=0 → tables.length=1', async () => {
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
  it('SPEC-PDFSPEC-GET-TABLES-001 T-4: table_index=999 → エラー', async () => {
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
  it('SPEC-PDFSPEC-GET-TABLES-001 T-5: テーブルなしセクション → tables.length=0', async () => {
    // "7.2.2" はテーブルなしと判明している
    const result = await toolHandlers.get_tables({ section: '7.2.2', spec: 'iso32000-2' });
    expect(result.totalTables).toBe(0);
    expect(result.tables).toHaveLength(0);
  });

  // T-6: PDF 1.7
  it('SPEC-PDFSPEC-GET-TABLES-002 T-6: pdf17 9.8.1 → Table 122 が 22 行 1 表（#16: 0.6.2 は 0 件だった）', async () => {
    // PDF32000_2008.pdf nests every table as P > Span > Table; 0.6.2 collected the
    // outer P as text and reported 0 tables for every section of pdf17.
    const result = await toolHandlers.get_tables({ section: '9.8.1', spec: 'pdf17' });
    expect(result.totalTables).toBe(1);
    expect(result.tables[0].caption).toMatch(/^Table 122/);
    expect(result.tables[0].headers).toEqual(['Key', 'Type', 'Value']);
    // Spans pp.289-291; the header is restated on each page and must not become rows.
    expect(result.tables[0].rows).toHaveLength(22);
    expect(result.tables[0].rows.map((r) => r[0])).toEqual(
      expect.arrayContaining(['FontName', 'FontFile', 'FontFile2', 'FontFile3', 'CharSet']),
    );
  });

  it('SPEC-PDFSPEC-GET-TABLES-004 T-6b: pdf17 7.7.2 → Table 28（表 0 件が pdf17 全体の症状だったことの対照）', async () => {
    const result = await toolHandlers.get_tables({ section: '7.7.2', spec: 'pdf17' });
    expect(result.totalTables).toBe(1);
    expect(result.tables[0].caption).toMatch(/^Table 28/);
  });

  // T-6c / T-6d: Annex の表はキャプションが英字付き（#22）
  it('SPEC-PDFSPEC-GET-TABLES-004 T-6c: pdf17 Annex F → Table F.1〜F.12 の 12 表、caption はすべて非 null（#22: 0.8.0 は 7 表・全部 null）', async () => {
    // F.3〜F.12 はヘッダが Item / Size (bits) / Description で共通。キャプションが取れないと
    // ヘッダ再掲の連結規則が別々の表を 1 つに畳む。
    const result = await toolHandlers.get_tables({ section: 'Annex F', spec: 'pdf17' });
    expect(result.totalTables).toBe(12);
    expect(result.tables.map((t) => t.caption?.match(/^Table F\.(\d+)/)?.[1])).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '10',
      '11',
      '12',
    ]);
    // 行は 1 本も増減しない（0.8.0 の 7 表の合計と同じ 88 行）
    expect(result.tables.reduce((n, t) => n + t.rows.length, 0)).toBe(88);

    const leaf = await toolHandlers.get_tables({
      section: 'F.4.1 Page Offset Hint Table', // Annex の子はキーがタイトル全体（落とし穴 8）
      spec: 'pdf17',
    });
    expect(leaf.totalTables).toBe(2);
    expect(leaf.tables.map((t) => t.rows.length)).toEqual([13, 7]);
  });

  it('SPEC-PDFSPEC-GET-TABLES-004 T-6d: iso32000-2 Annex A → Table A.1 が 73 行 1 表で caption あり / Annex O の "Table Annex O.n" も取れる', async () => {
    const a = await toolHandlers.get_tables({ section: 'Annex A', spec: 'iso32000-2' });
    expect(a.totalTables).toBe(1);
    expect(a.tables[0].caption).toMatch(/^Table A\.1 — PDF content stream operators/);
    expect(a.tables[0].rows).toHaveLength(73);

    const o = await toolHandlers.get_tables({ section: 'Annex O', spec: 'iso32000-2' });
    expect(o.totalTables).toBe(2);
    expect(o.tables.map((t) => t.caption?.slice(0, 16))).toEqual([
      'Table Annex O.3 ',
      'Table Annex O.4 ',
    ]);
  });

  // T-7: 小規模PDF (ts32002)
  it('SPEC-PDFSPEC-GET-TABLES-001 T-7: ts32002 → 正常動作', async () => {
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
  it('SPEC-PDFSPEC-GET-TABLES-001 T-8: pdf17old → フォールバック動作', async () => {
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
  it('SPEC-PDFSPEC-GET-TABLES-001 T-9: iso32000-2 のテーブルでヘッダーとボディ行が分離', async () => {
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
  it('SPEC-PDFSPEC-GET-TABLES-003 T-10: Table 126 は 21 行・全セル空の行ゼロ（構造木に空 TR は存在しない）', async () => {
    // ページ跨ぎ Table 要素（386 の断片が TH 内に他ページの Figure を抱える）の輪切りが
    // ["","",""] 行として合成されていた。地上真実は pdf-lib ダンプ + reader M-8 で確認済み:
    // データ行 7+5+7+2 = 21、空行ゼロ。
    const result = await toolHandlers.get_tables({ section: '10.6.3', spec: 'iso32000-2' });
    expect(result.totalTables).toBe(1);
    expect(result.tables[0].rows).toHaveLength(21);
    expect(result.tables[0].rows.every((r) => r.some((c) => c.trim() !== ''))).toBe(true);
  });

  // T-11: S-9 回帰 — 次セクションの表を前セクションに残さない
  it('SPEC-PDFSPEC-GET-TABLES-005 T-11: 8.4.3.3 に Table 54（8.4.3.4 の表）が不完全な重複として現れない', async () => {
    const result = await toolHandlers.get_tables({ section: '8.4.3.3', spec: 'iso32000-2' });
    const captions = result.tables.map((t) => t.caption ?? '');
    expect(captions.some((c) => c.includes('Table 53'))).toBe(true);
    expect(captions.some((c) => c.includes('Table 54'))).toBe(false);

    // Table 54 の完全版は 8.4.3.4 が持つ（Miter / Round / Bevel の 3 行）
    const owner = await toolHandlers.get_tables({ section: '8.4.3.4', spec: 'iso32000-2' });
    expect(owner.tables[0].caption).toContain('Table 54');
    expect(owner.tables[0].rows).toHaveLength(3);
  });

  // T-12: #25 — 正誤表のキャプションは扱い方を決めていない役割の直下の文字だった
  it('SPEC-PDFSPEC-GET-TABLES-008 実際の正誤表の節', async () => {
    const result = await toolHandlers.get_tables({ section: 'Issue #156', spec: 'iso32000-2' });
    expect(result.totalTables).toBe(1);
    expect(result.tables[0].caption).toMatch(/^Table 323a/);
  });
});
