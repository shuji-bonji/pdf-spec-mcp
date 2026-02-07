/**
 * 03 - get_structure E2E Tests
 *
 * S-1 〜 S-8: 全17仕様の構造取得、max_depth、デフォルトspec、enrichSpecInfo
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { HAS_PDFS, initRegistry, ALL_SPEC_IDS, SPEC_EXPECTATIONS } from './setup.js';
import { expectInRange } from './helpers.js';
import { toolHandlers } from '../../src/tools/handlers.js';
import { getSpecInfo } from '../../src/services/pdf-registry.js';

describe.skipIf(!HAS_PDFS)('03 - get_structure', () => {
  beforeAll(async () => {
    await initRegistry();
  });

  // S-1: 全17仕様の基本構造取得
  describe('S-1: 全17仕様の基本構造取得', () => {
    for (const specId of ALL_SPEC_IDS) {
      const exp = SPEC_EXPECTATIONS[specId];
      it(`${specId}: title, totalPages, totalSections が期待範囲`, async () => {
        const result = await toolHandlers.get_structure({ spec: specId });

        // title がパターンに一致
        expect(result.title).toMatch(exp.titlePattern);

        // totalPages が範囲内
        expectInRange(result.totalPages, exp.pagesRange[0], exp.pagesRange[1]);

        // totalSections が範囲内
        expectInRange(result.totalSections, exp.sectionsRange[0], exp.sectionsRange[1]);
      });
    }
  });

  // S-2: セクション構造の妥当性
  describe('S-2: 全17仕様のセクション構造妥当性', () => {
    for (const specId of ALL_SPEC_IDS) {
      it(`${specId}: セクション構造が妥当`, async () => {
        const result = await toolHandlers.get_structure({ spec: specId });
        // セクションが0件の仕様もある (declarations 等)
        expect(result.sections.length).toBeGreaterThanOrEqual(0);

        // トップレベルのセクションを検証
        for (const section of result.sections) {
          // page は -1 (未解決) の場合もある
          expect(typeof section.page).toBe('number');
          if (section.sectionNumber !== null) {
            expect(typeof section.sectionNumber).toBe('string');
          }
        }
      });
    }
  });

  // S-3: max_depth=1
  it('S-3: max_depth=1 で children が全て空配列', async () => {
    const result = await toolHandlers.get_structure({ spec: 'iso32000-2', max_depth: 1 });
    for (const section of result.sections) {
      expect(section.children).toEqual([]);
    }
  });

  // S-4: max_depth=2
  it('S-4: max_depth=2 で depth=1 の children は空', async () => {
    const result = await toolHandlers.get_structure({ spec: 'iso32000-2', max_depth: 2 });

    // トップレベルに children を持つセクションがある
    const hasChildren = result.sections.some((s) => s.children.length > 0);
    expect(hasChildren).toBe(true);

    // depth=1 の子は全て children=[]
    for (const section of result.sections) {
      for (const child of section.children) {
        expect(child.children).toEqual([]);
      }
    }
  });

  // S-5: max_depth 省略
  it('S-5: max_depth 省略で完全なツリー (ネストあり)', async () => {
    const result = await toolHandlers.get_structure({ spec: 'iso32000-2' });

    // 深いネストが存在するはず
    let maxDepth = 0;
    function checkDepth(entries: typeof result.sections, depth: number) {
      for (const entry of entries) {
        if (depth > maxDepth) maxDepth = depth;
        if (entry.children.length > 0) {
          checkDepth(entry.children, depth + 1);
        }
      }
    }
    checkDepth(result.sections, 0);
    expect(maxDepth).toBeGreaterThanOrEqual(2);
  });

  // S-6: max_depth 境界値
  it('S-6: max_depth=0 → エラー', async () => {
    await expect(
      toolHandlers.get_structure({ spec: 'iso32000-2', max_depth: 0 })
    ).rejects.toThrow('max_depth');
  });

  it('S-6: max_depth=11 → エラー', async () => {
    await expect(
      toolHandlers.get_structure({ spec: 'iso32000-2', max_depth: 11 })
    ).rejects.toThrow('max_depth');
  });

  // S-7: デフォルト spec
  it('S-7: spec なし → iso32000-2', async () => {
    const result = await toolHandlers.get_structure({});
    expect(result.title).toMatch(/PDF 2\.0/);
  });

  // S-8: enrichSpecInfo 反映
  describe('S-8: get_structure 後に SpecInfo が更新される', () => {
    for (const specId of ALL_SPEC_IDS) {
      it(`${specId}: pages/outlineEntries が更新される`, async () => {
        await toolHandlers.get_structure({ spec: specId });

        const info = getSpecInfo(specId);
        expect(info).toBeDefined();
        expect(info!.pages).not.toBeNull();
        expect(info!.pages).toBeGreaterThan(0);
        expect(info!.outlineEntries).not.toBeNull();
        // outlineEntries は 0 の場合もある (declarations 等ブックマークなし)
        expect(info!.outlineEntries).toBeGreaterThanOrEqual(0);
      });
    }
  });
});
