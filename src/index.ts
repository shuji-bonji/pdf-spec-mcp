#!/usr/bin/env node

/**
 * PDF Spec MCP Server
 * MCP server for structured understanding of ISO 32000 (PDF) specifications
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { tools } from './tools/definitions.js';
import { toolHandlers, type ToolName } from './tools/handlers.js';
import { PDFSpecError } from './errors.js';
import { PACKAGE_INFO } from './config.js';

const server = new Server(
  {
    name: PACKAGE_INFO.name,
    version: PACKAGE_INFO.version,
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// Execute tool
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (!(name in toolHandlers)) {
      throw new Error(`Unknown tool: ${name}`);
    }

    // Type boundary: MCP SDK provides args as Record<string, unknown>.
    // After validating the tool name, we cast args to match the handler's
    // expected input — each handler validates its own arguments at runtime.
    const handler = toolHandlers[name as ToolName];
    const result = await (handler as (a: Record<string, unknown>) => Promise<unknown>)(args ?? {});
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = error instanceof PDFSpecError ? error.code : 'INTERNAL_ERROR';
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: message, code }, null, 2) }],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${PACKAGE_INFO.name} v${PACKAGE_INFO.version} started`);
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
