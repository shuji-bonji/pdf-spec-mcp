/**
 * `dump-sections.mjs` のダイジェスト 2 つを比べ、節ごと・ツールごとの差を分類して出す（#21）。
 *
 * 「差 0 件」が「測っていない」と同じ顔をしないように、出力は必ず
 *   - 読んだ基準線と対象（spec / 版 / 節数）
 *   - 比べた節の数と、片側にしか無い節の数
 *   - ツールごとの差の件数（内容 / 表の個数 / 表の行数 / キャプションだけ / 要件の件数 / boundary）
 * を先頭に置く。差の本文（どの節がどう変わったか）はその後ろ。
 *
 * 使い方:
 *   node scripts/diff-dumps.mjs .golden/pdf17.digest.json .dump/pdf17.digest.json
 *   node scripts/diff-dumps.mjs <old> <new> --json        # 機械可読
 *   node scripts/diff-dumps.mjs <old> <new> --fail-on-diff # 差があれば exit 1（CI 用）
 *
 * 全文 dump（.dump/<spec>/*.json）がある場合は、差が出た節の表キャプションと要件 id を並べて
 * 「増えただけ」「並びが変わっただけ」「本文が変わった」を分けて見せる。
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const argv = process.argv.slice(2);
const [oldPath, newPath] = argv.filter((a) => !a.startsWith('--'));
if (!oldPath || !newPath) {
  console.error('usage: node scripts/diff-dumps.mjs <old.digest.json> <new.digest.json> [--json] [--fail-on-diff]');
  process.exit(2);
}
const JSON_OUT = argv.includes('--json');
const FAIL = argv.includes('--fail-on-diff');

const A = JSON.parse(readFileSync(oldPath, 'utf8'));
const B = JSON.parse(readFileSync(newPath, 'utf8'));
if (A.spec !== B.spec) {
  console.error(`spec mismatch: ${A.spec} vs ${B.spec}`);
  process.exit(2);
}

const fullOf = (p) => {
  const dir = join(dirname(p), A.spec);
  const read = (k) => (existsSync(join(dir, `${k}.json`)) ? JSON.parse(readFileSync(join(dir, `${k}.json`), 'utf8')) : null);
  return { tables: read('tables'), requirements: read('requirements') };
};
const fullA = fullOf(oldPath);
const fullB = fullOf(newPath);

const secA = new Set(Object.keys(A.sections));
const secB = new Set(Object.keys(B.sections));
const onlyA = [...secA].filter((s) => !secB.has(s));
const onlyB = [...secB].filter((s) => !secA.has(s));
const both = [...secA].filter((s) => secB.has(s));

const counts = {
  content: 0,
  boundary: 0,
  pageRange: 0,
  tablesCount: 0,
  tablesRows: 0,
  tablesCaptionOnly: 0,
  requirementsCount: 0,
  requirementsTextOnly: 0,
  errors: 0,
};
const details = [];
const eq = (x, y) => JSON.stringify(x) === JSON.stringify(y);

for (const s of both) {
  const a = A.sections[s];
  const b = B.sections[s];
  const d = { section: s, title: b.title ?? a.title, changes: [] };

  if (a.content?.error || b.content?.error || a.tables?.error || b.tables?.error || a.requirements?.error || b.requirements?.error) {
    counts.errors++;
    d.changes.push({ kind: 'error', old: a.content?.error ?? a.tables?.error ?? a.requirements?.error ?? null, new: b.content?.error ?? b.tables?.error ?? b.requirements?.error ?? null });
  }
  if (!eq(a.boundary, b.boundary)) {
    counts.boundary++;
    d.changes.push({ kind: 'boundary', old: a.boundary, new: b.boundary });
  }
  if (!eq(a.pageRange, b.pageRange)) {
    counts.pageRange++;
    d.changes.push({ kind: 'pageRange', old: a.pageRange, new: b.pageRange });
  }
  if (a.content?.sha !== b.content?.sha) {
    counts.content++;
    d.changes.push({ kind: 'content', old: { elements: a.content?.elements, byType: a.content?.byType }, new: { elements: b.content?.elements, byType: b.content?.byType } });
  }
  if (a.tables && b.tables && !a.tables.error && !b.tables.error && a.tables.sha !== b.tables.sha) {
    if (a.tables.total !== b.tables.total) {
      counts.tablesCount++;
      d.changes.push({ kind: 'tables.count', old: a.tables.total, new: b.tables.total, oldCaptions: a.tables.captions, newCaptions: b.tables.captions });
    } else if (!eq(a.tables.rows, b.tables.rows)) {
      counts.tablesRows++;
      d.changes.push({ kind: 'tables.rows', old: a.tables.rows, new: b.tables.rows });
    } else if (!eq(a.tables.captions, b.tables.captions)) {
      counts.tablesCaptionOnly++;
      d.changes.push({ kind: 'tables.captionOnly', old: a.tables.captions, new: b.tables.captions });
    } else {
      // 同じ個数・同じ行数・同じキャプションでセルの中身だけ違う
      counts.tablesRows++;
      d.changes.push({ kind: 'tables.cells', note: 'same count/rows/captions, cell text differs' });
    }
  }
  if (a.requirements && b.requirements && !a.requirements.error && !b.requirements.error && a.requirements.sha !== b.requirements.sha) {
    if (a.requirements.total !== b.requirements.total) {
      counts.requirementsCount++;
      const ch = { kind: 'requirements.count', old: a.requirements.total, new: b.requirements.total, oldStats: a.requirements.statistics, newStats: b.requirements.statistics };
      if (fullA.requirements && fullB.requirements) {
        const ta = new Set((fullA.requirements[s]?.requirements ?? []).map((r) => r.text));
        const tb = new Set((fullB.requirements[s]?.requirements ?? []).map((r) => r.text));
        ch.removedTexts = [...ta].filter((t) => !tb.has(t));
        ch.addedTexts = [...tb].filter((t) => !ta.has(t));
      }
      d.changes.push(ch);
    } else {
      counts.requirementsTextOnly++;
      d.changes.push({ kind: 'requirements.textOnly', total: b.requirements.total });
    }
  }
  if (d.changes.length) details.push(d);
}

const report = {
  spec: A.spec,
  baseline: { path: oldPath, version: A.generatedWith, sections: secA.size },
  candidate: { path: newPath, version: B.generatedWith, sections: secB.size },
  compared: { sections: both.length, onlyInBaseline: onlyA.length, onlyInCandidate: onlyB.length },
  summaryBaseline: A.summary,
  summaryCandidate: B.summary,
  differences: counts,
  sectionsWithDifferences: details.length,
  details,
  onlyInBaseline: onlyA,
  onlyInCandidate: onlyB,
};

const anyDiff = details.length > 0 || onlyA.length > 0 || onlyB.length > 0;

if (JSON_OUT) {
  console.log(JSON.stringify(report, null, 1));
} else {
  const v = (g) => `${g?.package ?? '?'} (dist ${g?.dist ?? '?'})`;
  console.log(`spec: ${A.spec}`);
  console.log(`baseline : ${oldPath}  version ${v(A.generatedWith)}  sections ${secA.size}`);
  console.log(`candidate: ${newPath}  version ${v(B.generatedWith)}  sections ${secB.size}`);
  console.log(`compared : ${both.length} sections (only in baseline ${onlyA.length}, only in candidate ${onlyB.length})`);
  console.log('summary  : baseline → candidate');
  for (const k of Object.keys(B.summary ?? {})) {
    const o = A.summary?.[k];
    const n = B.summary?.[k];
    console.log(`  ${k.padEnd(24)} ${String(o).padStart(6)} → ${String(n).padStart(6)}${o !== n ? '  *' : ''}`);
  }
  console.log('differences by kind:');
  for (const [k, n] of Object.entries(counts)) console.log(`  ${k.padEnd(24)} ${n}`);
  console.log(`sections with differences: ${details.length}`);
  for (const d of details) {
    console.log(`- ${d.section} ${d.title ?? ''}`);
    for (const c of d.changes) {
      const { kind, ...rest } = c;
      console.log(`    ${kind}: ${JSON.stringify(rest)}`);
    }
  }
  if (onlyA.length) console.log(`only in baseline: ${onlyA.join(', ')}`);
  if (onlyB.length) console.log(`only in candidate: ${onlyB.join(', ')}`);
  console.log(anyDiff ? 'RESULT: differences found' : `RESULT: no differences across ${both.length} sections × ${A.tools?.length ?? 3} tools`);
}
if (FAIL && anyDiff) process.exit(1);
