/**
 * External spec snapshot — the safety net for the A-4 migration.
 *
 * A-4 replaces the low-level `Server` + hand-written JSON Schema with
 * `McpServer` + `registerTool` + Zod. The tools themselves must not change: same names,
 * same accepted arguments, same required fields. This pins that surface *now*, so the
 * migration has something to be measured against.
 *
 * Deliberately driven over the MCP protocol rather than by reading `tools/definitions.ts`:
 * after A-4 the schema is generated from Zod, so a test that inspected the definitions
 * table would have to be rewritten as part of the very change it is meant to guard. What
 * goes over the wire is the contract, and this file must survive A-4 untouched.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
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
  inputSchema: {
    type?: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

let listed: ListedTool[];

beforeAll(async () => {
  const server = buildServer();
  const client = new Client({ name: 'registry-test', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
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

  it('rejects an unknown tool without killing the server', async () => {
    // The dispatcher's fallback: the migration must keep returning an error result rather
    // than throwing out of the transport.
    const server = buildServer();
    const client = new Client({ name: 'registry-test', version: '0.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const res = await client.callTool({ name: 'no_such_tool', arguments: {} });

    expect(res.isError).toBe(true);
  });

  it('reports a tool error as an isError result carrying a code', async () => {
    // list_specs is the one tool that needs no spec PDFs, so this stays a unit test.
    // An invalid category is not an error (it filters to nothing), so drive a real failure:
    // get_section without PDF_SPEC_DIR configured must surface a structured error.
    const server = buildServer();
    const client = new Client({ name: 'registry-test', version: '0.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const res = await client.callTool({ name: 'get_section', arguments: {} });

    expect(res.isError).toBe(true);
    const payload = JSON.parse((res.content as { text: string }[])[0].text);
    expect(payload).toHaveProperty('error');
    expect(payload).toHaveProperty('code');
  });
});
