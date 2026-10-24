/**
 * 06 - get_requirements E2E Tests
 *
 * RQ-1 〜 RQ-12: セクション/レベルフィルタ、全仕様、統計情報
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { toolHandlers } from '../../src/tools/handlers.js';
import { ALL_SPEC_IDS, HAS_PDFS, initRegistry } from './setup.js';

describe.skipIf(!HAS_PDFS)('06 - get_requirements', () => {
  beforeAll(async () => {
    await initRegistry();
  });

  // RQ-1: セクション指定
  it('SPEC-PDFSPEC-GET-REQUIREMENTS-003 RQ-1: iso32000-2 section="12.8" → totalRequirements > 0', async () => {
    const result = await toolHandlers.get_requirements({
      section: '12.8',
      spec: 'iso32000-2',
    });
    expect(result.totalRequirements).toBeGreaterThan(0);
    expect(result.statistics).toBeDefined();
    expect(result.filter.section).toBe('12.8');
  });

  // RQ-2: レベルフィルタ (shall)
  it('SPEC-PDFSPEC-GET-REQUIREMENTS-003 RQ-2: level="shall" → 全件 level="shall"', async () => {
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
  it('SPEC-PDFSPEC-GET-REQUIREMENTS-003 RQ-3: level="may" → 全件 level="may"', async () => {
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
  it('SPEC-PDFSPEC-GET-REQUIREMENTS-003 RQ-4: section="7.3" + level="shall" → AND 条件', async () => {
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
  it('SPEC-PDFSPEC-GET-REQUIREMENTS-003 RQ-5: フィルタなしで totalRequirements > 100', async () => {
    const result = await toolHandlers.get_requirements({
      spec: 'iso32000-2',
    });
    expect(result.totalRequirements).toBeGreaterThan(100);
    expect(result.filter.section).toBe('all');
    expect(result.filter.level).toBe('all');
  });

  // RQ-6: PDF 1.7
  it('SPEC-PDFSPEC-GET-REQUIREMENTS-003 RQ-6: pdf17 section="7" → 正常動作', async () => {
    const result = await toolHandlers.get_requirements({
      section: '7',
      spec: 'pdf17',
    });
    expect(result.totalRequirements).toBeGreaterThan(0);
  });

  it('SPEC-PDFSPEC-GET-REQUIREMENTS-005 RQ-6b: pdf17 9.6.4 shall → 2 件、すべて 9.6.4 の本文（#15: 0.6.2 は隣の節を含めて 7 件）', async () => {
    const result = await toolHandlers.get_requirements({
      section: '9.6.4',
      spec: 'pdf17',
      level: 'shall',
    });
    expect(result.totalRequirements).toBe(2);
    for (const r of result.requirements) {
      expect(r.section).toBe('9.6.4');
      expect(r.text).toMatch(/subset|tag/);
    }
  });

  it('SPEC-PDFSPEC-GET-REQUIREMENTS-005 RQ-6c: pdf17 Annex C shall → 1 件（見出し不在だと Annex C / C.1 / C.2 で同じ文を 3 回数えていた）', async () => {
    const result = await toolHandlers.get_requirements({
      section: 'Annex C',
      spec: 'pdf17',
      level: 'shall',
    });
    expect(result.totalRequirements).toBe(1);
    expect(result.requirements[0].section).toBe('C.2 Architectural limits');
  });

  // RQ-7: 小規模PDF
  it('SPEC-PDFSPEC-GET-REQUIREMENTS-003 RQ-7: ts32002 → 正常動作 (0件でもOK)', async () => {
    const result = await toolHandlers.get_requirements({
      spec: 'ts32002',
      section: '1', // セクション指定で高速化
    });
    expect(result.totalRequirements).toBeGreaterThanOrEqual(0);
  });

  // RQ-8: 全17仕様 (セクション指定なし — 低速なので先頭セクションのみ)
  describe('SPEC-PDFSPEC-GET-REQUIREMENTS-003 RQ-8: 全17仕様でエラーなく実行', () => {
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
  it('SPEC-PDFSPEC-GET-REQUIREMENTS-003 RQ-9: statistics の合計 = totalRequirements', async () => {
    const result = await toolHandlers.get_requirements({
      section: '12.8',
      spec: 'iso32000-2',
    });
    const total = Object.values(result.statistics).reduce((sum, v) => sum + v, 0);
    expect(total).toBe(result.totalRequirements);
  });

  // RQ-10: 無効なレベル
  it('SPEC-PDFSPEC-GET-REQUIREMENTS-003 RQ-10: level="invalid" → エラー', async () => {
    await expect(
      toolHandlers.get_requirements({ level: 'invalid', spec: 'iso32000-2' }),
    ).rejects.toThrow(/Invalid requirement level/i);
  });

  // RQ-11: "shall not" 検出
  it('SPEC-PDFSPEC-GET-REQUIREMENTS-003 RQ-11: level="shall not" → shall not のみ', async () => {
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
  it('SPEC-PDFSPEC-GET-REQUIREMENTS-002 RQ-12: section="12.8" の全 Requirement ID がユニーク', async () => {
    const result = await toolHandlers.get_requirements({
      section: '12.8',
      spec: 'iso32000-2',
    });
    const ids = result.requirements.map((r) => r.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  // RQ-13: #25 — キャプションが取れた正誤表の表の要件に table が付く
  it('SPEC-PDFSPEC-GET-REQUIREMENTS-008 実際の正誤表の節', async () => {
    const result = await toolHandlers.get_requirements({
      section: 'Issue #156',
      spec: 'iso32000-2',
    });
    expect(result.totalRequirements).toBe(5);
    for (const r of result.requirements) {
      expect(r.table).toMatch(/^Table 323a/);
    }
  });
});
