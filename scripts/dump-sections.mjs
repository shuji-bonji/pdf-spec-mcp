/**
 * 1 つの仕様の全節に get_section / get_tables / get_requirements を流し、JSON に落とす（#21）。
 *
 * なぜ要るか: 抽出ロジックの退行は e2e の固定値（数節分）では出ない。8.7.4.5.5 の表の退行も
 * pdf17 の「全節が前後の節を含む」（#15 / #16）も、旧 dist と新 dist の全数差分でしか見つからな
 * かった。その dump はこれまで一時ファイルで、手順も数字も残っていなかった。
 *
 * 出力は 2 層:
 *   - 全文 dump   `<out>/<spec>/{section,tables,requirements}.json`
 *                 本文を含むので **コミットしない**（仕様 PDF は著作物。`.dump/` は .gitignore 済み）。
 *                 新旧 dist の差分を人が読むときに使う
 *   - ダイジェスト `<out>/<spec>.digest.json`
 *                 節ごとに要素数・表の個数と行数・要件の件数・boundary・内容の SHA-256 だけを持つ。
 *                 これを `.golden/` にコミットして基準線にする（`--golden`）
 *
 * 使い方:
 *   PDF_SPEC_DIR=./pdf-spec node scripts/dump-sections.mjs pdf17                # .dump/ に全文 + ダイジェスト
 *   PDF_SPEC_DIR=./pdf-spec node scripts/dump-sections.mjs pdf17 --golden       # .golden/<spec>.digest.json を更新
 *   PDF_SPEC_DIR=./pdf-spec node scripts/dump-sections.mjs pdf17 --out /tmp/old --dist /path/to/old/dist
 *
 * 比較は `scripts/diff-dumps.mjs`。索引のディスクキャッシュは常に off で回す（落とし穴 7）。
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

process.env.PDF_SPEC_CACHE = 'off';

const argv = process.argv.slice(2);
const specId = argv.find((a) => !a.startsWith('--'));
if (!specId) {
  console.error('usage: node scripts/dump-sections.mjs <specId> [--out DIR] [--dist DIR] [--golden]');
  process.exit(2);
}
const flag = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const root = resolve(dirname(new URL(import.meta.url).pathname), '..');
const outDir = resolve(flag('--out', join(root, '.dump')));
const distDir = resolve(flag('--dist', join(root, 'dist')));
const GOLDEN = argv.includes('--golden');

const { toolHandlers } = await import(pathToFileURL(join(distDir, 'tools/handlers.js')).href);
const { getSectionIndex } = await import(pathToFileURL(join(distDir, 'services/pdf-service.js')).href);
const { ensureRegistryInitialized, getSpecInfo } = await import(
  pathToFileURL(join(distDir, 'services/pdf-registry.js')).href
);

const sha = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const distPkg = (() => {
  try {
    return JSON.parse(readFileSync(join(distDir, '..', 'package.json'), 'utf8')).version;
  } catch {
    return 'unknown';
  }
})();

await ensureRegistryInitialized();
const index = await getSectionIndex(specId);
const info = getSpecInfo(specId);
const sections = index.flatOrder.map((s) => s.sectionNumber);

const full = { section: {}, tables: {}, requirements: {} };
const digest = {};
const errors = [];
let done = 0;
for (const sec of sections) {
  const entry = {};
  try {
    const r = await toolHandlers.get_section({ section: sec, spec: specId });
    full.section[sec] = r;
    const byType = {};
    for (const el of r.content) byType[el.type] = (byType[el.type] ?? 0) + 1;
    entry.title = r.title;
    entry.pageRange = r.pageRange;
    entry.boundary = r.boundary;
    entry.content = { elements: r.content.length, byType, sha: sha(r.content) };
  } catch (e) {
    entry.content = { error: String(e.message ?? e) };
    errors.push({ tool: 'get_section', section: sec, error: String(e.message ?? e) });
  }
  try {
    const t = await toolHandlers.get_tables({ section: sec, spec: specId });
    full.tables[sec] = t;
    entry.tables = {
      total: t.totalTables,
      captions: t.tables.map((x) => x.caption),
      rows: t.tables.map((x) => x.rows.length),
      sha: sha(t.tables),
    };
  } catch (e) {
    entry.tables = { error: String(e.message ?? e) };
    errors.push({ tool: 'get_tables', section: sec, error: String(e.message ?? e) });
  }
  try {
    const q = await toolHandlers.get_requirements({ section: sec, spec: specId });
    full.requirements[sec] = q;
    entry.requirements = {
      total: q.totalRequirements,
      statistics: q.statistics,
      cutByPage: q.sectionsCutByPage.map((x) => x.section),
      sha: sha(q.requirements),
    };
  } catch (e) {
    entry.requirements = { error: String(e.message ?? e) };
    errors.push({ tool: 'get_requirements', section: sec, error: String(e.message ?? e) });
  }
  digest[sec] = entry;
  done++;
  if (done % 100 === 0) process.stderr.write(`${specId}: ${done}/${sections.length}\n`);
}

// 基準値（CHANGELOG / Issue に書く数字はここから取る。手で数えない）
const vals = Object.values(digest);
// outline に同じ節番号が 2 回出ることがある（iso32000-2 の 14.8.4.7.3 = 本文と正誤表 Issue #133）。
// digest は節番号をキーにするので、数えるのはキーの数。重複は別に記録して隠さない
const dupes = sections.filter((s, i) => sections.indexOf(s) !== i);
const summary = {
  sections: Object.keys(digest).length,
  outlineEntries: sections.length,
  duplicateSectionNumbers: dupes,
  startsWithOwnHeading: vals.filter((v) => v.boundary?.start === 'heading').length,
  // get_requirements が自節をページ切りと申告した節（#17 の sectionsCutByPage と同じ定義）
  cutByPage: Object.entries(digest).filter(([s, v]) => v.requirements?.cutByPage?.includes(s)).length,
  // 公開応答の boundary（親は自分の start と最後の子孫の end）の分布
  boundaryKinds: vals.reduce((m, v) => {
    if (!v.boundary) return m;
    const k = `${v.boundary.start}/${v.boundary.end}`;
    m[k] = (m[k] ?? 0) + 1;
    return m;
  }, {}),
  tablesTotal: vals.reduce((n, v) => n + (v.tables?.total ?? 0), 0),
  tablesTotalLeafOnly: index.flatOrder
    .filter((s) => s.children.length === 0)
    .reduce((n, s) => n + (digest[s.sectionNumber]?.tables?.total ?? 0), 0),
  tablesWithNullCaption: vals.reduce(
    (n, v) => n + (v.tables?.captions ?? []).filter((c) => c === null).length,
    0,
  ),
  requirementsTotal: vals.reduce((n, v) => n + (v.requirements?.total ?? 0), 0),
  errors: errors.length,
};

const digestDoc = {
  spec: specId,
  file: info?.filename ?? null,
  generatedWith: { package: pkg.version, dist: distPkg, node: process.version },
  tools: ['get_section', 'get_tables', 'get_requirements'],
  summary,
  errors,
  sections: digest,
};

mkdirSync(join(outDir, specId), { recursive: true });
for (const k of Object.keys(full)) {
  writeFileSync(join(outDir, specId, `${k}.json`), JSON.stringify(full[k], null, 1));
}
writeFileSync(join(outDir, `${specId}.digest.json`), JSON.stringify(digestDoc, null, 1));
if (GOLDEN) {
  mkdirSync(join(root, '.golden'), { recursive: true });
  writeFileSync(join(root, '.golden', `${specId}.digest.json`), JSON.stringify(digestDoc, null, 1));
}
console.log(JSON.stringify({ spec: specId, out: outDir, golden: GOLDEN, summary }, null, 2));
