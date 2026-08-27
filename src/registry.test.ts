/**
 * External spec snapshot — what this server promises its clients.
 *
 * Written before the A-4 migration (low-level `Server` + hand-written JSON Schema →
 * `McpServer` + `registerTool` + Zod) to pin the surface the migration had to preserve:
 * same tool names, same accepted arguments, same required fields.
 *
 * Deliberately driven over the MCP protocol rather than by reading `tools/definitions.ts`.
 * The schema is now generated from Zod, so a test that inspected the definitions table
 * would have had to be rewritten as part of the very change it was meant to guard. What
 * goes over the wire is the contract.
 *
 * It earned its keep: the migration changed how schema violations are reported (the SDK
 * now rejects them before the handler runs), which this caught. That boundary is asserted
 * below rather than left implicit.
 */
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from './server.js';

/** tool name → required fields, exactly as published today. */
const EXPECTED_TOOLS: Record<string, string[]> = {
  list_specs: [],
  get_structure: [],
  get_section: ['section'],
  search_spec: ['query'],
  get_requirements: [],
  get_definitions: [],
  get_tables: ['section'],
  compare_versions: [],
};

/** tool name → every accepted property, so a silently dropped argument is caught. */
const EXPECTED_PROPERTIES: Record<string, string[]> = {
  list_specs: ['category'],
  get_structure: ['spec', 'max_depth'],
  get_section: ['spec', 'section'],
  search_spec: ['spec', 'query', 'max_results'],
  get_requirements: ['spec', 'section', 'level'],
  get_definitions: ['spec', 'term'],
  get_tables: ['spec', 'section', 'table_index'],
  compare_versions: ['section'],
};

interface ListedTool {
  name: string;
  description?: string;
  annotations?: { readOnlyHint?: boolean; openWorldHint?: boolean };
  inputSchema: {
    type?: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

/** A client wired to a fresh server over an in-memory transport. */
async function connect(): Promise<Client> {
  const server = buildServer();
  const client = new Client({ name: 'registry-test', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

let listed: ListedTool[];

beforeAll(async () => {
  const client = await connect();
  const res = await client.listTools();
  listed = res.tools as ListedTool[];
});

describe('tool registry (external spec)', () => {
  it('exposes exactly the 8 expected tools', () => {
    expect(listed.map((t) => t.name).sort()).toEqual(Object.keys(EXPECTED_TOOLS).sort());
  });

  it.each(Object.entries(EXPECTED_TOOLS))('%s keeps its required fields', (name, required) => {
    const tool = listed.find((t) => t.name === name);
    expect(tool).toBeDefined();
    expect((tool?.inputSchema.required ?? []).sort()).toEqual([...required].sort());
  });

  it.each(Object.entries(EXPECTED_PROPERTIES))('%s keeps its accepted arguments', (name, props) => {
    const tool = listed.find((t) => t.name === name);
    expect(tool).toBeDefined();
    expect(Object.keys(tool?.inputSchema.properties ?? {}).sort()).toEqual([...props].sort());
  });

  it('every tool has a description', () => {
    for (const tool of listed) {
      expect(tool.description, tool.name).toBeTruthy();
    }
  });

  it('every tool takes an object', () => {
    for (const tool of listed) {
      expect(tool.inputSchema.type, tool.name).toBe('object');
    }
  });

  it('知らないツール名は JSON-RPC エラーとして返り、サーバは動き続ける', async () => {
    // SDK v2 で失敗の届け先が変わった（2026-08-27 に生の JSON-RPC で実測）。
    //   v1: ツール結果 { isError: true, content: [{ text: 'MCP error -32602: Tool ... not found' }] }
    //   v2: JSON-RPC の error（code -32602）。ツール結果は返らない
    // 入力検証の失敗は v1 / v2 とも isError: true のまま（次のテスト）。移ったのは
    // 「ツール名が無い」場合だけである。
    const client = await connect();

    await expect(client.callTool({ name: 'no_such_tool', arguments: {} })).rejects.toThrow(
      /no_such_tool/,
    );

    // 同じクライアントで次の呼び出しが通ることを見る（サーバが動き続けている）。
    const ok = await client.listTools();
    expect(ok.tools.length).toBe(Object.keys(EXPECTED_TOOLS).length);
  });

  it('rejects arguments that violate the published schema', async () => {
    // Schema violations are the SDK's to reject: registerTool checks the shape before the
    // handler runs, and answers with the MCP standard "invalid params" (-32602).
    //
    // This is a change from the hand-written validators, which caught the same mistakes
    // inside the handler and so returned the family's structured error. Errors that pass
    // the schema still carry `code` — see the test below. The boundary is asserted rather
    // than left implicit, since it decides what an agent can branch on.
    const client = await connect();

    const res = await client.callTool({ name: 'get_section', arguments: {} });

    expect(res.isError).toBe(true);
    expect((res.content as { text: string }[])[0].text).toContain('Invalid arguments');
  });

  it('reports a tool error the schema cannot catch as a structured error', async () => {
    // `level` is a free-form string in the schema (case and spacing are forgiven), so an
    // invalid value reaches the handler — and must come back with the family contract.
    const client = await connect();

    const res = await client.callTool({
      name: 'get_requirements',
      arguments: { level: 'definitely-not-a-level' },
    });

    expect(res.isError).toBe(true);
    const payload = JSON.parse((res.content as { text: string }[])[0].text);
    expect(payload.code).toBe('VALIDATION_ERROR');
    expect(payload.error).toContain('Invalid requirement level');
    expect(payload.retryable).toBe(true);
  });

  it('every tool is annotated read-only', () => {
    // This server only reads specification PDFs. A tool that claimed otherwise would be
    // telling clients they must ask permission for a lookup.
    for (const tool of listed) {
      expect(tool.annotations, tool.name).toBeDefined();
      expect(tool.annotations?.readOnlyHint, tool.name).toBe(true);
      expect(tool.annotations?.openWorldHint, tool.name).toBe(false);
    }
  });
});
