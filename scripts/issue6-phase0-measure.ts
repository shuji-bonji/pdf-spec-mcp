/**
 * Phase 0 (Issue #6): 使い捨て計測。全仕様の search 索引と requirements 全走査の構築時間と
 * JSON 化したサイズを、ツールと同じ経路（defaultPdfService）で直列に測る。
 */
import { ensureRegistryInitialized, listSpecs } from '../src/services/pdf-registry.js';
import { defaultPdfService, getRequirements, searchSpec } from '../src/services/pdf-service.js';

await ensureRegistryInitialized();
const only = process.argv.slice(2);
const specs = listSpecs().filter((s) => only.length === 0 || only.includes(s.id));

// biome-ignore lint/suspicious/noExplicitAny: private access for measurement only
const svc = defaultPdfService as any;

const rows: string[] = [];
let totalSearch = 0;
let totalReq = 0;
let totalBytes = 0;
for (const s of specs) {
  const t0 = Date.now();
  await searchSpec('shall', 1, s.id);
  const tSearch = Date.now() - t0;
  const idx = await svc.searchIndexMap.get(s.id);
  const searchBytes = Buffer.byteLength(JSON.stringify(idx.pages));

  const t1 = Date.now();
  const req = await getRequirements(undefined, undefined, s.id);
  const tReq = Date.now() - t1;
  const reqBytes = Buffer.byteLength(JSON.stringify(req.requirements));

  totalSearch += tSearch;
  totalReq += tReq;
  totalBytes += searchBytes + reqBytes;
  rows.push(
    `${s.id.padEnd(18)} pages=${String(s.pages).padStart(5)} search=${String(tSearch).padStart(6)}ms ${(searchBytes / 1024).toFixed(0).padStart(6)}KB  req=${String(tReq).padStart(6)}ms n=${String(req.totalRequirements).padStart(5)} ${(reqBytes / 1024).toFixed(0).padStart(6)}KB`,
  );
  console.error(rows[rows.length - 1]);
}
console.error('---');
console.error(
  `total search=${totalSearch}ms req=${totalReq}ms bytes=${(totalBytes / 1024 / 1024).toFixed(1)}MB`,
);
