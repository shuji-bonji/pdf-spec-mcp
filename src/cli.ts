/**
 * Maintenance CLI for the on-disk index cache (Issue #6).
 *
 *   pdf-spec-mcp --build-cache [--spec=<id>[,<id>...]] [--force]
 *   pdf-spec-mcp --clear-cache
 *   pdf-spec-mcp --cache-info
 *
 * Not MCP tools: none of this is something an agent should decide to run mid-conversation,
 * and a full build walks every page of every spec (~1 minute for the 17-spec corpus on a
 * laptop). It is the same shape as houki-nta-mcp's `--bulk-download-everything`, so the
 * same cron line works.
 *
 * `--build-cache` goes through the very same service the tools use (searchSpec /
 * getRequirements), so there is no second index-building path that could drift from what
 * a tool call builds. Specs are processed one at a time: pdfjs's PagesMapper is a global
 * whose page count belongs to the last document opened, so walking two documents at once
 * fails with "Invalid page request" (see pdf-loader.ts).
 *
 * Output goes to stderr. index.ts installs the stdout guard before anything else, so even
 * a stray console.log would land there too.
 */

import { CACHE_ENV, PACKAGE_INFO } from './config.js';
import { FileIndexStore } from './services/index-store.js';
import { getOutlineWithPages, loadDocument, reloadDocument } from './services/pdf-loader.js';
import {
  enrichSpecInfo,
  ensureRegistryInitialized,
  getSpecPath,
  listSpecs,
  resolveSpecId,
} from './services/pdf-registry.js';
import { PDFSpecService } from './services/pdf-service.js';

export const CLI_FLAGS = [
  '--build-cache',
  '--clear-cache',
  '--cache-info',
  '--help',
  '-h',
] as const;

/** True when argv asks for the CLI rather than the stdio server. */
export function isCliInvocation(argv: string[]): boolean {
  return argv.some((a) => (CLI_FLAGS as readonly string[]).includes(a));
}

export const USAGE = `${PACKAGE_INFO.name} v${PACKAGE_INFO.version}

Usage:
  pdf-spec-mcp                      start the MCP server on stdio (default)
  pdf-spec-mcp --build-cache        build and store the search + requirements indexes
                                    for every spec in PDF_SPEC_DIR, one spec at a time
      [--spec=<id>[,<id>...]]       only these spec ids (see list_specs)
      [--force]                     rebuild even when a valid cache entry exists
  pdf-spec-mcp --clear-cache        delete the whole cache directory (every version)
  pdf-spec-mcp --cache-info         show the cache directory and what is in it
  pdf-spec-mcp --help

Environment:
  PDF_SPEC_DIR          directory containing the specification PDFs (required)
  ${CACHE_ENV.dir}    cache directory (default: \${XDG_CACHE_HOME:-~/.cache}/pdf-spec-mcp)
  ${CACHE_ENV.toggle}=off    neither read nor write the cache
`;

interface ParsedArgs {
  command: 'build' | 'clear' | 'info' | 'help';
  specs: string[];
  force: boolean;
  unknown: string[];
}

export function parseCliArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = { command: 'help', specs: [], force: false, unknown: [] };
  for (const arg of argv) {
    if (arg === '--build-cache') parsed.command = 'build';
    else if (arg === '--clear-cache') parsed.command = 'clear';
    else if (arg === '--cache-info') parsed.command = 'info';
    else if (arg === '--help' || arg === '-h') parsed.command = 'help';
    else if (arg === '--force') parsed.force = true;
    else if (arg.startsWith('--spec=')) {
      parsed.specs.push(
        ...arg
          .slice('--spec='.length)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      );
    } else parsed.unknown.push(arg);
  }
  return parsed;
}

const kb = (bytes: number) => `${(bytes / 1024).toFixed(0).padStart(6)} KB`;
const ms = (n: number) => `${String(n).padStart(6)} ms`;

/**
 * Runs the CLI and returns the process exit code. `out` is stderr by default; `env` is
 * where the cache settings are read from (tests pass their own, PDF_SPEC_DIR still comes
 * from process.env via the registry).
 */
export async function runCli(
  argv: string[],
  out: (line: string) => void = (line) => console.error(line),
  env: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  const args = parseCliArgs(argv);
  if (args.unknown.length > 0) {
    out(`Unknown argument(s): ${args.unknown.join(' ')}`);
    out(USAGE);
    return 2;
  }
  if (args.command === 'help') {
    out(USAGE);
    return 0;
  }

  const store = new FileIndexStore({ bypassLoad: args.force, env });
  const info = store.describe();

  if (args.command === 'clear') {
    const existed = await store.clear();
    out(existed ? `Removed ${info.dir}` : `Nothing to remove at ${info.dir}`);
    return 0;
  }

  if (args.command === 'info') {
    out(`${PACKAGE_INFO.name} v${PACKAGE_INFO.version}`);
    out(`cache directory : ${info.dir}`);
    out(`enabled         : ${info.enabled ? 'yes' : `no (${CACHE_ENV.toggle}=off)`}`);
    out(
      `current key     : v${info.versions.schema} / ${info.versions.package} / pdfjs ${info.versions.pdfjs}`,
    );
    const entries = await store.entries();
    if (entries.length === 0) {
      out('entries         : none');
      return 0;
    }
    const total = entries.reduce((n, e) => n + e.bytes, 0);
    out(`entries         : ${entries.length} file(s), ${kb(total).trim()}`);
    const current = `v${info.versions.schema}/${info.versions.package}/`;
    for (const e of entries) {
      const tag = e.relative.startsWith(current) ? 'current' : 'other version';
      out(`  ${kb(e.bytes)}  ${e.relative}  (${tag})`);
    }
    return 0;
  }

  // --build-cache
  if (!info.enabled) {
    out(`The cache is disabled (${CACHE_ENV.toggle}=off); nothing to build.`);
    return 2;
  }
  await ensureRegistryInitialized();
  const service = new PDFSpecService(
    { getSpecPath, resolveSpecId, enrichSpecInfo },
    { loadDocument, reloadDocument, getOutlineWithPages },
    store,
  );

  const all = listSpecs();
  const wanted = args.specs.length > 0 ? args.specs : all.map((s) => s.id);
  const missing = wanted.filter((id) => !all.some((s) => s.id === id));
  if (missing.length > 0) {
    out(`Unknown spec id(s): ${missing.join(', ')}. Available: ${all.map((s) => s.id).join(', ')}`);
    return 2;
  }

  out(
    `Building indexes into ${info.dir} (${wanted.length} spec(s), sequential)${args.force ? ' [--force]' : ''}`,
  );
  let failures = 0;
  const t0 = Date.now();
  for (const id of wanted) {
    const pdfPath = getSpecPath(id);
    const line = [id.padEnd(18)];
    try {
      const s0 = Date.now();
      const hadSearch = !args.force && (await store.load('search', id, pdfPath)) !== null;
      await service.searchSpec('shall', 1, id);
      line.push(`search ${hadSearch ? '   hit' : ' built'} ${ms(Date.now() - s0)}`);

      const r0 = Date.now();
      const hadReq = !args.force && (await store.load('requirements', id, pdfPath)) !== null;
      const req = await service.getRequirements(undefined, undefined, id);
      line.push(
        `requirements ${hadReq ? '   hit' : ' built'} ${ms(Date.now() - r0)} (${req.totalRequirements})`,
      );
      out(line.join('  '));
    } catch (err) {
      failures++;
      line.push(`FAILED: ${err instanceof Error ? err.message : String(err)}`);
      out(line.join('  '));
    }
  }
  const entries = await store.entries();
  const total = entries.reduce((n, e) => n + e.bytes, 0);
  out(
    `Done in ${((Date.now() - t0) / 1000).toFixed(1)} s — ${entries.length} file(s), ${kb(total).trim()} under ${info.dir}` +
      (failures > 0 ? ` — ${failures} spec(s) FAILED` : ''),
  );
  return failures > 0 ? 1 : 0;
}
