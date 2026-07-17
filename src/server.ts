/**
 * MCP server construction.
 *
 * Kept apart from index.ts so the server can be built without starting a stdio
 * transport — `registry.test.ts` drives it over an in-memory transport to pin the
 * external tool surface. index.ts is left as the entry point that wires it to stdio.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { PACKAGE_INFO } from './config.js';
import { PDFSpecError } from './errors.js';
import { tools } from './tools/definitions.js';
import { type ToolName, toolHandlers } from './tools/handlers.js';

/**
 * Build the MCP server with all tools registered.
 * Does not connect a transport — the caller decides how it is driven.
 */
export function buildServer(): Server {
  const server = new Server(
    {
      name: PACKAGE_INFO.name,
      version: PACKAGE_INFO.version,
    },
    {
      capabilities: {
        tools: {},
      },
    },
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
      const result = await (handler as (a: Record<string, unknown>) => Promise<unknown>)(
        args ?? {},
      );
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

  return server;
}
