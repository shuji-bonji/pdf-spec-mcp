/**
 * Phase 3 Full Feature Verification Script
 * Tests all 8 tools via direct service/handler imports against real PDFs.
 *
 * Usage: PDF_SPEC_DIR=./pdf-spec npx tsx scripts/phase3-verify.ts
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { toolHandlers } from '../src/tools/handlers.js';
import { ensureRegistryInitialized, listSpecs, isSpecAvailable } from '../src/services/pdf-registry.js';

// ========================================
// Helpers
// ========================================

interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL';
  detail: string;
  duration: number;
}

const results: TestResult[] = [];

async function test(name: string, fn: () => Promise<string>): Promise<void> {
  const start = Date.now();
  try {
    const detail = await fn();
    const duration = Date.now() - start;
    results.push({ name, status: 'PASS', detail, duration });
    console.log(`  ✅ ${name} (${duration}ms) — ${detail}`);
  } catch (e: any) {
    const duration = Date.now() - start;
    const msg = e?.message || String(e);
    results.push({ name, status: 'FAIL', detail: msg, duration });
    console.log(`  ❌ ${name} (${duration}ms) — ${msg}`);
  }
}

async function expectThrow(name: string, fn: () => Promise<any>, expectedMsg: string): Promise<void> {
  const start = Date.now();
  try {
    await fn();
    const duration = Date.now() - start;
    results.push({ name, status: 'FAIL', detail: 'Expected error but succeeded', duration });
    console.log(`  ❌ ${name} (${duration}ms) — Expected error but succeeded`);
  } catch (e: any) {
    const duration = Date.now() - start;
    const msg = e?.message || String(e);
    if (msg.includes(expectedMsg)) {
      results.push({ name, status: 'PASS', detail: `Got expected error: "${expectedMsg}"`, duration });
      console.log(`  ✅ ${name} (${duration}ms) — Got expected error`);
    } else {
      results.push({ name, status: 'FAIL', detail: `Wrong error: "${msg}" (expected: "${expectedMsg}")`, duration });
      console.log(`  ❌ ${name} (${duration}ms) — Wrong error: ${msg}`);
    }
  }
}

// ========================================
// Main
// ========================================

async function main() {
  console.log('='.repeat(60));
  console.log('Phase 3 Full Feature Verification');
  console.log('='.repeat(60));
  console.log();

  // ── 検証2: レジストリ初期化 ──

  console.log('── 検証2: PDF環境確認 + レジストリ初期化 ──');

  await test('ensureRegistryInitialized', async () => {
    await ensureRegistryInitialized();
    const specs = listSpecs();
    return `${specs.length} specs discovered`;
  });

  await test('all 17 PDFs discovered', async () => {
    const specs = listSpecs();
    if (specs.length !== 17) throw new Error(`Expected 17, got ${specs.length}`);
    return `OK: ${specs.map(s => s.id).join(', ')}`;
  });

  console.log();

  // ── 検証3: list_specs ──

  console.log('── 検証3: list_specs ──');

  await test('list_specs (all)', async () => {
    const result = await toolHandlers.list_specs({}) as any;
    if (result.totalSpecs !== 17) throw new Error(`Expected 17, got ${result.totalSpecs}`);
    return `totalSpecs=${result.totalSpecs}`;
  });

  await test('list_specs (category=standard)', async () => {
    const result = await toolHandlers.list_specs({ category: 'standard' }) as any;
    if (result.totalSpecs !== 4) throw new Error(`Expected 4, got ${result.totalSpecs}`);
    return `totalSpecs=${result.totalSpecs}`;
  });

  await test('list_specs (category=ts)', async () => {
    const result = await toolHandlers.list_specs({ category: 'ts' }) as any;
    if (result.totalSpecs !== 5) throw new Error(`Expected 5, got ${result.totalSpecs}`);
    return `totalSpecs=${result.totalSpecs}`;
  });

  await test('list_specs (category=pdfua)', async () => {
    const result = await toolHandlers.list_specs({ category: 'pdfua' }) as any;
    if (result.totalSpecs !== 2) throw new Error(`Expected 2, got ${result.totalSpecs}`);
    return `totalSpecs=${result.totalSpecs}`;
  });

  await test('list_specs (category=guide)', async () => {
    const result = await toolHandlers.list_specs({ category: 'guide' }) as any;
    if (result.totalSpecs !== 3) throw new Error(`Expected 3, got ${result.totalSpecs}`);
    return `totalSpecs=${result.totalSpecs}`;
  });

  await test('list_specs (category=appnote)', async () => {
    const result = await toolHandlers.list_specs({ category: 'appnote' }) as any;
    if (result.totalSpecs !== 3) throw new Error(`Expected 3, got ${result.totalSpecs}`);
    return `totalSpecs=${result.totalSpecs}`;
  });

  console.log();

  // ── 検証4: 後方互換（spec なし） ──

  console.log('── 検証4: 既存ツール後方互換（spec なし） ──');

  await test('get_structure (default)', async () => {
    const result = await toolHandlers.get_structure({}) as any;
    if (!result.title.includes('ISO 32000-2')) throw new Error(`Unexpected title: ${result.title}`);
    return `title="${result.title}", pages=${result.totalPages}, sections=${result.totalSections}`;
  });

  await test('get_section 7.3.4 (default)', async () => {
    const result = await toolHandlers.get_section({ section: '7.3.4' }) as any;
    if (result.sectionNumber !== '7.3.4') throw new Error(`Got: ${result.sectionNumber}`);
    return `section=${result.sectionNumber}, title="${result.title}", content=${result.content.length} elements`;
  });

  await test('search_spec "digital signature" (default)', async () => {
    const result = await toolHandlers.search_spec({ query: 'digital signature' }) as any;
    if (result.totalResults === 0) throw new Error('No results');
    return `query="${result.query}", results=${result.totalResults}`;
  });

  await test('get_requirements section=12.8 (default)', async () => {
    const result = await toolHandlers.get_requirements({ section: '12.8' }) as any;
    if (result.totalRequirements === 0) throw new Error('No requirements found');
    return `requirements=${result.totalRequirements}, stats=${JSON.stringify(result.statistics)}`;
  });

  await test('get_definitions term="font" (default)', async () => {
    const result = await toolHandlers.get_definitions({ term: 'font' }) as any;
    if (result.totalDefinitions === 0) throw new Error('No definitions found');
    return `definitions=${result.totalDefinitions}`;
  });

  await test('get_tables section=7.2.2 (default)', async () => {
    const result = await toolHandlers.get_tables({ section: '7.2.2' }) as any;
    return `tables=${result.totalTables}`;
  });

  console.log();

  // ── 検証5: spec パラメータ ──

  console.log('── 検証5: 既存ツール spec パラメータ ──');

  await test('get_structure (spec=pdf17)', async () => {
    const result = await toolHandlers.get_structure({ spec: 'pdf17' }) as any;
    if (!result.title.includes('PDF 1.7') && !result.title.includes('32000-1')) {
      throw new Error(`Unexpected title: ${result.title}`);
    }
    return `title="${result.title}", pages=${result.totalPages}, sections=${result.totalSections}`;
  });

  await test('get_structure (spec=ts32002)', async () => {
    const result = await toolHandlers.get_structure({ spec: 'ts32002' }) as any;
    if (!result.title.includes('32002')) throw new Error(`Unexpected title: ${result.title}`);
    return `title="${result.title}", pages=${result.totalPages}, sections=${result.totalSections}`;
  });

  await test('get_structure (spec=wtpdf)', async () => {
    const result = await toolHandlers.get_structure({ spec: 'wtpdf' }) as any;
    if (!result.title.includes('WTPDF')) throw new Error(`Unexpected title: ${result.title}`);
    return `title="${result.title}", pages=${result.totalPages}, sections=${result.totalSections}`;
  });

  await test('get_structure (spec=pdfua2)', async () => {
    const result = await toolHandlers.get_structure({ spec: 'pdfua2' }) as any;
    if (!result.title.includes('14289-2') && !result.title.includes('PDF/UA-2')) {
      throw new Error(`Unexpected title: ${result.title}`);
    }
    return `title="${result.title}", pages=${result.totalPages}, sections=${result.totalSections}`;
  });

  await test('get_section (spec=pdf17, section=7.3)', async () => {
    const result = await toolHandlers.get_section({ spec: 'pdf17', section: '7.3' }) as any;
    return `section=${result.sectionNumber}, title="${result.title}", content=${result.content.length} elements`;
  });

  await test('search_spec (spec=pdf17, query="cross-reference")', async () => {
    const result = await toolHandlers.search_spec({ spec: 'pdf17', query: 'cross-reference' }) as any;
    if (result.totalResults === 0) throw new Error('No results');
    return `results=${result.totalResults}`;
  });

  console.log();

  // ── 検証5b: enrichSpecInfo 反映確認 ──

  console.log('── 検証5b: enrichSpecInfo 反映確認 ──');

  await test('SpecInfo pages/outlineEntries populated after get_structure', async () => {
    const specs = listSpecs();
    const iso = specs.find(s => s.id === 'iso32000-2');
    const pdf17 = specs.find(s => s.id === 'pdf17');
    if (!iso || iso.pages === null) throw new Error(`iso32000-2 pages still null`);
    if (!pdf17 || pdf17.pages === null) throw new Error(`pdf17 pages still null`);
    return `iso32000-2: ${iso.pages}p/${iso.outlineEntries}s, pdf17: ${pdf17.pages}p/${pdf17.outlineEntries}s`;
  });

  console.log();

  // ── 検証6: compare_versions ──

  console.log('── 検証6: compare_versions ──');

  await test('compare_versions (full)', async () => {
    const result = await toolHandlers.compare_versions({}) as any;
    if (result.totalMatched === 0) throw new Error('No matched sections');
    return `matched=${result.totalMatched}, added=${result.totalAdded}, removed=${result.totalRemoved}`;
  });

  await test('compare_versions (section=12.8)', async () => {
    const result = await toolHandlers.compare_versions({ section: '12.8' }) as any;
    return `matched=${result.totalMatched}, added=${result.totalAdded}, removed=${result.totalRemoved}`;
  });

  await test('compare_versions (section=7.3)', async () => {
    const result = await toolHandlers.compare_versions({ section: '7.3' }) as any;
    return `matched=${result.totalMatched}, added=${result.totalAdded}, removed=${result.totalRemoved}`;
  });

  console.log();

  // ── 検証7: エラーハンドリング ──

  console.log('── 検証7: エラーハンドリング + エッジケース ──');

  await expectThrow(
    'get_structure (invalid spec)',
    () => toolHandlers.get_structure({ spec: 'nonexistent' }),
    'not found'
  );

  await expectThrow(
    'get_section (missing section)',
    () => toolHandlers.get_section({}),
    'Section must be a string'
  );

  await expectThrow(
    'get_section (empty section)',
    () => toolHandlers.get_section({ section: '' }),
    'must not be empty'
  );

  await expectThrow(
    'search_spec (empty query)',
    () => toolHandlers.search_spec({ query: '' }),
    'must not be empty'
  );

  await expectThrow(
    'get_definitions (spec=ts32002 → unsupported)',
    () => toolHandlers.get_definitions({ spec: 'ts32002' }),
    'only supported for ISO 32000-2'
  );

  await expectThrow(
    'get_section (spec=pdf17, section=nonexistent)',
    () => toolHandlers.get_section({ spec: 'pdf17', section: '99.99.99' }),
    'not found'
  );

  await expectThrow(
    'validateSpecId (too long)',
    () => toolHandlers.get_structure({ spec: 'a'.repeat(51) }),
    '50 characters'
  );

  console.log();

  // ── 検証7b: parseSectionNumber 拡張確認 ──

  console.log('── 検証7b: parseSectionNumber 拡張確認（WTPDF構造） ──');

  await test('get_structure (spec=wtpdf) has sections with single-digit numbers', async () => {
    const result = await toolHandlers.get_structure({ spec: 'wtpdf' }) as any;
    const hasNumericSections = result.sections.some((s: any) => /^\d+$/.test(s.sectionNumber));
    if (!hasNumericSections) throw new Error('No single-digit sections found in WTPDF');
    const nums = result.sections
      .filter((s: any) => /^\d+$/.test(s.sectionNumber))
      .map((s: any) => s.sectionNumber);
    return `WTPDF top-level sections: ${nums.join(', ')}`;
  });

  await test('get_structure (spec=tagged-bpg) has Appendix sections', async () => {
    const result = await toolHandlers.get_structure({ spec: 'tagged-bpg', max_depth: 1 }) as any;
    const appendices = result.sections.filter((s: any) =>
      s.sectionNumber?.startsWith('Appendix')
    );
    return `Appendix sections: ${appendices.length} (${appendices.map((a: any) => a.sectionNumber).join(', ')})`;
  });

  console.log();

  // ── サマリー ──

  console.log('='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const total = results.length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  console.log(`Total: ${total} tests, ✅ ${passed} passed, ❌ ${failed} failed (${totalDuration}ms)`);
  console.log();

  if (failed > 0) {
    console.log('FAILED TESTS:');
    for (const r of results.filter(r => r.status === 'FAIL')) {
      console.log(`  ❌ ${r.name}: ${r.detail}`);
    }
    process.exit(1);
  } else {
    console.log('🎉 All tests passed!');
    process.exit(0);
  }
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(2);
});
