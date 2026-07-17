/**
 * MCP server construction (A-4: McpServer + registerTool + Zod).
 *
 * Kept apart from index.ts so the server can be built without starting a stdio
 * transport — `registry.test.ts` drives it over an in-memory transport to pin the
 * external tool surface. index.ts is left as the entry point that wires it to stdio.
 *
 * Tools come from the definitions.ts registry rather than being registered by hand here,
 * so "what this server exposes" is one list rather than a sequence of calls, and a tool
 * defined without a handler fails loudly at startup instead of at first use.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { PACKAGE_INFO } from './config.js';
import { toStructuredError } from './errors.js';
import { tools } from './tools/definitions.js';
import { type ToolName, toolHandlers } from './tools/handlers.js';
import { logger } from './utils/logger.js';

/**
 * Build the MCP server with all tools registered.
 * Does not connect a transport — the caller decides how it is driven.
 */
export function buildServer(): McpServer {
  const server = new McpServer({
    name: PACKAGE_INFO.name,
    version: PACKAGE_INFO.version,
  });

  for (const tool of tools) {
    const handler = toolHandlers[tool.name as ToolName];
    if (!handler) {
      throw new Error(`No handler registered for tool: ${tool.name}`);
    }

    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.shape,
        annotations: tool.annotations,
      },
      async (args: unknown) => {
        try {
          const result = await handler(args);
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          };
        } catch (error) {
          // Report failures as an isError result rather than throwing: a thrown error
          // reaches the client as an opaque protocol error, losing the code / hint /
          // next_actions an agent needs to recover (規約 §2.3).
          const structured = toStructuredError(error);
          logger.error(tool.name, structured.error, error instanceof Error ? error : undefined);
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(structured, null, 2) }],
            isError: true,
          };
        }
      },
    );
  }

  return server;
}
