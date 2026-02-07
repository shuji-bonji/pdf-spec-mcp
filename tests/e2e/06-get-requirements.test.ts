/**
 * 06 - get_requirements E2E Tests
 *
 * RQ-1 〜 RQ-12: セクション/レベルフィルタ、全仕様、統計情報
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { HAS_PDFS, initRegistry, ALL_SPEC_IDS } from './setup.js';
import { toolHandlers } from '../../src/tools/handlers.js';

describe.skipIf(!HAS_PDFS)('06 - get_requirements', () => {
  beforeAll(async () => {
    await initRegistry();
  });

  // RQ-1: セクション指定
  it('RQ-1: iso32000-2 section="12.8" → totalRequirements > 0', async () => {
    const result = await toolHandlers.get_requirements({
      section: '12.8',
      spec: 'iso32000-2',
    });
    expect(result.totalRequirements).toBeGreaterThan(0);
    expect(result.statistics).toBeDefined();
    expect(result.filter.section).toBe('12.8');
  });

  // RQ-2: レベルフィルタ (shall)
  it('RQ-2: level="shall" → 全件 level="shall"', async () => {
    const result = await toolHandlers.get_requirements({
      section: '12.8',
      level: 'shall',
      spec: 'iso32000-2',
    });
    for (const req of result.requirements) {
      expect(req.level).toBe('shall');
    }
  });

  // RQ-3: レベルフィルタ (may)
  it('RQ-3: level="may" → 全件 level="may"', async () => {
    const result = await toolHandlers.get_requirements({
      section: '12.8',
      level: 'may',
      spec: 'iso32000-2',
    });
    for (const req of result.requirements) {
      expect(req.level).toBe('may');
    }
  });

  // RQ-4: セクション+レベル
  it('RQ-4: section="7.3" + level="shall" → AND 条件', async () => {
    const result = await toolHandlers.get_requirements({
      section: '7.3',
      level: 'shall',
      spec: 'iso32000-2',
    });
    expect(result.filter.section).toBe('7.3');
    expect(result.filter.level).toBe('shall');
    for (const req of result.requirements) {
      expect(req.level).toBe('shall');
    }
  });

  // RQ-5: フィルタなし (全件) — ⚠️ 非常に遅い
  it('RQ-5: フィルタなしで totalRequirements > 100', async () => {
    const result = await toolHandlers.get_requirements({
      spec: 'iso32000-2',
    });
    expect(result.totalRequirements).toBeGreaterThan(100);
    expect(result.filter.section).toBe('all');
    expect(result.filter.level).toBe('all');
  });

  // RQ-6: PDF 1.7
  it('RQ-6: pdf17 section="7" → 正常動作', async () => {
    const result = await toolHandlers.get_requirements({
      section: '7',
      spec: 'pdf17',
    });
    expect(result.totalRequirements).toBeGreaterThanOrEqual(0);
  });

  // RQ-7: 小規模PDF
  it('RQ-7: ts32002 → 正常動作 (0件でもOK)', async () => {
    const result = await toolHandlers.get_requirements({
      spec: 'ts32002',
      section: '1', // セクション指定で高速化
    });
    expect(result.totalRequirements).toBeGreaterThanOrEqual(0);
  });

  // RQ-8: 全17仕様 (セクション指定なし — 低速なので先頭セクションのみ)
  describe('RQ-8: 全17仕様でエラーなく実行', () => {
    for (const specId of ALL_SPEC_IDS) {
      it(`${specId}: requirements 取得`, async () => {
        const structure = await toolHandlers.get_structure({ spec: specId });

        // totalSections=0 の仕様はスキップ
        if (structure.totalSections === 0) {
          return;
        }

        // ツリーから最初の有効なセクション番号を探す
        function findFirst(entries: typeof structure.sections): string | null {
          for (const e of entries) {
            if (e.sectionNumber) return e.sectionNumber;
            const child = findFirst(e.children);
            if (child) return child;
          }
          return null;
        }
        const section = findFirst(structure.sections);
        if (!section) return;

        const result = await toolHandlers.get_requirements({
          spec: specId,
          section,
        });
        expect(result.totalRequirements).toBeGreaterThanOrEqual(0);
      });
    }
  });

  // RQ-9: 統計情報の妥当性
  it('RQ-9: statistics の合計 = totalRequirements', async () => {
    const result = await toolHandlers.get_requirements({
      section: '12.8',
      spec: 'iso32000-2',
    });
    const total = Object.values(result.statistics).reduce((sum, v) => sum + v, 0);
    expect(total).toBe(result.totalRequirements);
  });

  // RQ-10: 無効なレベル
  it('RQ-10: level="invalid" → エラー', async () => {
    await expect(
      toolHandlers.get_requirements({ level: 'invalid', spec: 'iso32000-2' })
    ).rejects.toThrow(/Invalid requirement level/i);
  });

  // RQ-11: "shall not" 検出
  it('RQ-11: level="shall not" → shall not のみ', async () => {
    const result = await toolHandlers.get_requirements({
      section: '12.8',
      level: 'shall not',
      spec: 'iso32000-2',
    });
    for (const req of result.requirements) {
      expect(req.level).toBe('shall not');
    }
  });

  // RQ-12: Requirement ID 一意性
  it('RQ-12: section="12.8" の全 Requirement ID がユニーク', async () => {
    const result = await toolHandlers.get_requirements({
      section: '12.8',
      spec: 'iso32000-2',
    });
    const ids = result.requirements.map((r) => r.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});
