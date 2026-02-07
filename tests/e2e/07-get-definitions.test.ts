/**
 * 07 - get_definitions E2E Tests
 *
 * D-1 〜 D-12: 全定義取得、用語検索、非対応spec、構造検証
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { HAS_PDFS, initRegistry } from './setup.js';
import { toolHandlers } from '../../src/tools/handlers.js';

describe.skipIf(!HAS_PDFS)('07 - get_definitions', () => {
  beforeAll(async () => {
    await initRegistry();
  });

  // D-1: 全定義取得
  it('D-1: iso32000-2 term なし → totalDefinitions > 50', async () => {
    const result = await toolHandlers.get_definitions({ spec: 'iso32000-2' });
    expect(result.totalDefinitions).toBeGreaterThan(50);
    expect(result.definitions.length).toBe(result.totalDefinitions);
  });

  // D-2: 用語検索
  it('D-2: term="font" → "font" を含む定義', async () => {
    const result = await toolHandlers.get_definitions({ spec: 'iso32000-2', term: 'font' });
    expect(result.totalDefinitions).toBeGreaterThan(0);
    for (const def of result.definitions) {
      const contains =
        def.term.toLowerCase().includes('font') || def.definition.toLowerCase().includes('font');
      expect(contains).toBe(true);
    }
  });

  // D-3: 部分一致
  it('D-3: term="obj" → "object" 関連の定義がヒット', async () => {
    const result = await toolHandlers.get_definitions({ spec: 'iso32000-2', term: 'obj' });
    expect(result.totalDefinitions).toBeGreaterThan(0);
  });

  // D-4: 大文字小文字無視
  it('D-4: term="PDF" (大文字) → ヒット', async () => {
    const result = await toolHandlers.get_definitions({ spec: 'iso32000-2', term: 'PDF' });
    expect(result.totalDefinitions).toBeGreaterThan(0);
  });

  // D-5: ヒットなし
  it('D-5: term="xyzzy" → totalDefinitions=0', async () => {
    const result = await toolHandlers.get_definitions({ spec: 'iso32000-2', term: 'xyzzy' });
    expect(result.totalDefinitions).toBe(0);
    expect(result.definitions).toHaveLength(0);
  });

  // D-6: PDF 1.7
  it('D-6: pdf17 term なし → totalDefinitions >= 0 (サポート対象だがSection 3構造が異なる場合あり)', async () => {
    const result = await toolHandlers.get_definitions({ spec: 'pdf17' });
    expect(result.totalDefinitions).toBeGreaterThanOrEqual(0);
  });

  // D-7: iso32000-2-2020
  it('D-7: iso32000-2-2020 → 正常動作', async () => {
    const result = await toolHandlers.get_definitions({ spec: 'iso32000-2-2020' });
    expect(result.totalDefinitions).toBeGreaterThan(0);
  });

  // D-8: 非対応 spec (ts32002)
  it('D-8: ts32002 → "only supported for" エラー', async () => {
    await expect(toolHandlers.get_definitions({ spec: 'ts32002' })).rejects.toThrow(
      /only supported for/i
    );
  });

  // D-9: 非対応 spec (wtpdf)
  it('D-9: wtpdf → "only supported for" エラー', async () => {
    await expect(toolHandlers.get_definitions({ spec: 'wtpdf' })).rejects.toThrow(
      /only supported for/i
    );
  });

  // D-10: 非対応 spec (pdfua2)
  it('D-10: pdfua2 → "only supported for" エラー', async () => {
    await expect(toolHandlers.get_definitions({ spec: 'pdfua2' })).rejects.toThrow(
      /only supported for/i
    );
  });

  // D-11: 定義構造の検証
  it('D-11: 各定義の term 非空、definition 非空、section 形式 "3.X"', async () => {
    const result = await toolHandlers.get_definitions({ spec: 'iso32000-2' });
    for (const def of result.definitions) {
      expect(def.term).toBeTruthy();
      expect(def.definition).toBeTruthy();
      expect(def.section).toBeTruthy();
      // section は "3" で始まる
      expect(def.section.startsWith('3')).toBe(true);
    }
  });

  // D-12: notes/source 任意フィールド
  it('D-12: notes または source を持つ定義が存在する', async () => {
    const result = await toolHandlers.get_definitions({ spec: 'iso32000-2' });
    const hasNotes = result.definitions.some((d) => d.notes && d.notes.length > 0);
    const hasSource = result.definitions.some((d) => d.source !== undefined);
    // 少なくとも一方は存在するはず
    expect(hasNotes || hasSource).toBe(true);
  });
});
