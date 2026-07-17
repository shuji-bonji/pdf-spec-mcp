/**
 * biome の assist/source/organizeImports をサンドボックスで近似検査する。
 * サンドボックスでは biome 本体が動かない（node_modules が mac バイナリ）ため。
 *
 * biome 2.x の順序: node: 組み込み → 外部パッケージ → 相対パス。各グループ内は指定子の辞書順。
 * 副作用 import (`import './x.js';`) は境界として扱われ、跨いだ並べ替えはされない。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const files = [];
for (const root of ['src', 'tests']) {
  (function walk(d) {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith('.ts')) files.push(p);
    }
  })(root);
}

const rank = (s) => (s.startsWith('node:') ? 0 : s.startsWith('.') || s.startsWith('/') ? 2 : 1);
const cmp = (a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0);

let bad = 0;
for (const f of files) {
  const lines = readFileSync(f, 'utf8').split('\n');
  let group = [];
  const flush = () => {
    if (group.length > 1) {
      const sorted = [...group].sort(cmp);
      if (JSON.stringify(group) !== JSON.stringify(sorted)) {
        console.log(`✗ ${f}\n    actual: ${JSON.stringify(group)}\n    biome would sort to: ${JSON.stringify(sorted)}`);
        bad++;
      }
    }
    group = [];
  };
  for (const line of lines) {
    const withFrom = line.match(/^import\s+(?:type\s+)?.*\sfrom\s+'([^']+)';$/);
    if (withFrom) { group.push(withFrom[1]); continue; }
    if (/^import\s+'[^']+';$/.test(line)) { flush(); continue; } // 副作用 import = 境界
    if (line.trim() === '') continue;
    flush();
  }
  flush();
}
console.log(bad === 0 ? '\n✓ import 順: 全ファイル OK' : `\n✗ ${bad} 件`);
