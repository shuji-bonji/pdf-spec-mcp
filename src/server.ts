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
import { McpServer } from '@modelcontextprotocol/server';
import { PACKAGE_INFO } from './config.js';
import { toStructuredError } from './errors.js';
import { tools } from './tools/definitions.js';
import { type ToolName, toolHandlers } from './tools/handlers.js';
import { logger } from './utils/logger.js';

/**
 * Build the MCP server with all tools registered.
 * Does not connect a transport — the caller decides how it is driven.
 */
/**
 * `initialize` の応答としてクライアントへ返す説明（Issue #13 / family specs/12 §5 D-2）。
 *
 * **本サーバは「適合判定器」と繰り返し誤解されてきた。** README とツール説明にも同じことを
 * 書いてあるが、`instructions` はクライアントのシステムコンテキストに直接載るため、
 * ツールを 1 つも呼ばないうちに読まれる — 誤解を断つ位置としてはここが最も早い。
 */
const INSTRUCTIONS = `${PACKAGE_INFO.name} v${PACKAGE_INFO.version} — the running build identifies itself here so a stale install is visible without a tool call; compare against \`npm view ${PACKAGE_INFO.name} version\` when freshness matters.

This server is a REFERENCE to the PDF specification, not a rule engine.

It retrieves and structures the *text* of ISO 32000 (clauses, tables, definitions, and
shall/should/may requirements). It never opens or inspects a PDF file, and it cannot decide
whether a document conforms to anything. Conformance verdicts come from pdf-verify-mcp
(validate_conformance / evaluate_policy).

Keep three things apart:
  - declaration  — what a producer claims about itself (XMP pdfaid / pdfuaid). Proves nothing.
  - conformance  — nobody can prove it; it can only be disproved.
  - validation   — valid only within the rules a validator actually implements.
Reading a "shall" here tells you what the standard demands, never whether a file meets it.

A search that returns nothing means "this corpus cannot answer", NOT "no such requirement
exists". ISO 19005 (PDF/A) and ETSI PAdES are outside the corpus — call list_specs and read
coverage.gaps before concluding that a requirement is absent.`;

export function buildServer(): McpServer {
  const server = new McpServer(
    {
      name: PACKAGE_INFO.name,
      version: PACKAGE_INFO.version,
    },
    { instructions: INSTRUCTIONS },
  );

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
        inputSchema: tool.inputSchema,
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
