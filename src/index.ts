#!/usr/bin/env node

/**
 * PDF Spec MCP Server
 * MCP server for structured understanding of ISO 32000 (PDF) specifications
 */

// MUST be the first import: installs the stdout guard before any dependency
// (notably pdfjs-dist) is evaluated. See utils/stdout-guard.ts.
import './utils/stdout-guard.js';

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { isCliInvocation, runCli } from './cli.js';
import { PACKAGE_INFO } from './config.js';
import { buildServer } from './server.js';

// Start server — or run the cache maintenance CLI when asked to (Issue #6).
async function main() {
  const argv = process.argv.slice(2);
  if (isCliInvocation(argv)) {
    process.exit(await runCli(argv));
  }

  const server = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${PACKAGE_INFO.name} v${PACKAGE_INFO.version} started`);
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
