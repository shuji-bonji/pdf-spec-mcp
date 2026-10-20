/**
 * 13 - boundary (#17)
 *
 * B-1 〜 B-6: 節の両端が見出しで切れたか、ページの端で切れたかを応答が申告する。
 * 0.7.0 より前の pdf17 は全節がページ単位で切れていたのに、応答のどこにもそれが無かった。
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { toolHandlers } from '../../src/tools/handlers.js';
import { HAS_PDFS, initRegistry } from './setup.js';

describe.skipIf(!HAS_PDFS)('13 - boundary', () => {
  beforeAll(async () => {
    await initRegistry();
  });

  it('B-1: iso32000-2 12.8.2.2（親・跨ぎあり）→ heading / heading', async () => {
    const result = await toolHandlers.get_section({ section: '12.8.2.2', spec: 'iso32000-2' });
    expect(result.boundary).toEqual({ start: 'heading', end: 'heading' });
    expect(result.pageRange).toEqual({ start: 588, end: 589 });
  });

  it('B-2: pdf17 9.6.4（ページ共有）→ heading / heading（0.6.2 なら page / page_shared）', async () => {
    const result = await toolHandlers.get_section({ section: '9.6.4', spec: 'pdf17' });
    expect(result.boundary).toEqual({ start: 'heading', end: 'heading' });
  });

  it('B-3: get_tables は pageRange と boundary を持つ（pdf17 9.8.1 = 289–291）', async () => {
    const result = await toolHandlers.get_tables({ section: '9.8.1', spec: 'pdf17' });
    expect(result.pageRange).toEqual({ start: 289, end: 291 });
    expect(result.boundary).toEqual({ start: 'heading', end: 'heading' });
    // table_index 指定でも同じ項目が付く
    const one = await toolHandlers.get_tables({ section: '9.8.1', spec: 'pdf17', table_index: 0 });
    expect(one.pageRange).toEqual(result.pageRange);
    expect(one.boundary).toEqual(result.boundary);
  });

  it('B-4: get_requirements（節指定）は、ページで切れた節が無ければ空の一覧を返す', async () => {
    const result = await toolHandlers.get_requirements({ section: '9.6', spec: 'pdf17' });
    expect(result.sectionsCutByPage).toEqual([]);
  });

  it('B-5: pdf17 の全走査でページ切りになるのは Bibliography の項目だけ', async () => {
    // outline が参考文献の各項目を節として持っており、本文には見出しが無い。
    // 本文の節（823 - 11）はすべて見出しで切れている。
    const result = await toolHandlers.get_requirements({ spec: 'pdf17' });
    expect(result.sectionsCutByPage.length).toBe(11);
    for (const cut of result.sectionsCutByPage) {
      expect(cut.section.startsWith('[')).toBe(true);
    }
  });

  it('B-6: iso32000-2 の全走査でページ切りになるのは前付・後付と第 1 節だけ', async () => {
    const result = await toolHandlers.get_requirements({ spec: 'iso32000-2' });
    const sections = result.sectionsCutByPage.map((c) => c.section);
    expect(sections).toHaveLength(12);
    // 本文の節（7〜14 とその子孫）は 1 つも含まれない
    expect(sections.filter((s) => /^(?:[7-9]|1[0-4])(?:\.|$)/.test(s))).toEqual([]);
  });
});
