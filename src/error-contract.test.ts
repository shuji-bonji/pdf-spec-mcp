/**
 * エラー応答の契約（common-errors。pdf-spec-mcp#33、pdf-agent-stack#48）。
 *
 * ツールは McpServer に登録した実物を InMemoryTransport 越しに呼び、ツール結果の本文
 * （`content[0].text` の JSON）を見る。受け側（pdf-agent-stack の S6・編成 Skill）が読むのは
 * この本文なので、エラーのクラスではなく本文を契約として固定する。
 *
 * 仕様 PDF の要らない入力（引数の誤り・PDF_SPEC_DIR が無い）だけを使うので、CI で回る。
 */
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ToolPrerequisiteError, toStructuredError } from './errors.js';
import { buildServer } from './server.js';
import { GetSectionSchema, parseArgs } from './utils/validation.js';

const TOP_LEVEL = ['error', 'code', 'retryable', 'hint', 'next_actions', 'detail'];

interface ErrorBody {
  error: unknown;
  code: string;
  retryable: unknown;
  hint?: string;
  next_actions?: { action: string; reason: string }[];
  detail?: { legacyCode?: string };
}

let client: Client;
let savedDir: string | undefined;

beforeAll(async () => {
  // 仕様書の置き場を渡さない: 仕様書を読むツールはハンドラが REGISTRY_ERROR を返す
  savedDir = process.env.PDF_SPEC_DIR;
  delete process.env.PDF_SPEC_DIR;
  const server = buildServer();
  client = new Client({ name: 'error-contract-test', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
});

afterAll(() => {
  if (savedDir !== undefined) process.env.PDF_SPEC_DIR = savedDir;
});

async function callError(
  tool: string,
  args: Record<string, unknown>,
): Promise<{ isError: boolean; body: ErrorBody }> {
  const res = (await client.callTool({ name: tool, arguments: args })) as {
    isError?: boolean;
    content: { type: string; text: string }[];
  };
  return { isError: res.isError === true, body: JSON.parse(res.content[0].text) as ErrorBody };
}

function expectShape(body: ErrorBody): void {
  for (const key of Object.keys(body)) expect(TOP_LEVEL).toContain(key);
  expect(typeof body.error).toBe('string');
  expect(body.error).not.toBe('');
  expect(typeof body.code).toBe('string');
  expect(typeof body.retryable).toBe('boolean');
}

const badLevel = { level: 'definitely-not-a-level' };

describe('SPEC-PDFSPEC-COMMON-ERRORS-001 エラー応答の本文は family の平らな形にする', () => {
  it('SPEC-PDFSPEC-COMMON-ERRORS-001 引数の誤りが形どおり', async () => {
    const { isError, body } = await callError('get_requirements', badLevel);
    expect(isError).toBe(true);
    expectShape(body);
  });

  it('SPEC-PDFSPEC-COMMON-ERRORS-001 仕様書の置き場が無いエラーが形どおり', async () => {
    const { isError, body } = await callError('get_section', { section: '7.1' });
    expect(isError).toBe(true);
    expectShape(body);
    expect(body.code).toBe('REGISTRY_ERROR');
    expect(body.retryable).toBe(false);
  });
});

describe('SPEC-PDFSPEC-COMMON-ERRORS-002 引数の誤りは INVALID_ARGUMENT を返す', () => {
  it('SPEC-PDFSPEC-COMMON-ERRORS-002 要件の水準の誤りは INVALID_ARGUMENT', async () => {
    const { body } = await callError('get_requirements', badLevel);
    expect(body.code).toBe('INVALID_ARGUMENT');
    expect(body.retryable).toBe(true);
    expect(body.error).toContain('Valid levels');
  });

  it('SPEC-PDFSPEC-COMMON-ERRORS-002 引数の解析の失敗は INVALID_ARGUMENT', () => {
    let thrown: unknown;
    try {
      parseArgs(GetSectionSchema, {});
    } catch (e) {
      thrown = e;
    }
    expect((thrown as { code?: string }).code).toBe('INVALID_ARGUMENT');
  });
});

describe('SPEC-PDFSPEC-COMMON-ERRORS-003 retryable はすべてのエラーに書く', () => {
  it('SPEC-PDFSPEC-COMMON-ERRORS-003 故障にも retryable がある', () => {
    const body = toStructuredError(new Error('boom')) as unknown as ErrorBody;
    expectShape(body);
    expect(body.code).toBe('INTERNAL_ERROR');
    expect(body.retryable).toBe(false);
  });

  it('SPEC-PDFSPEC-COMMON-ERRORS-003 故障にも retryable がある（Error でない値）', () => {
    const body = toStructuredError('boom') as unknown as ErrorBody;
    expectShape(body);
    expect(body.retryable).toBe(false);
  });

  it('SPEC-PDFSPEC-COMMON-ERRORS-003 前提の不足は再試行できない', () => {
    const body = toStructuredError(
      new ToolPrerequisiteError('Required spec not available'),
    ) as unknown as ErrorBody;
    expectShape(body);
    expect(body.code).toBe('PREREQUISITE_ERROR');
    expect(body.retryable).toBe(false);
  });
});

describe('SPEC-PDFSPEC-COMMON-ERRORS-004 移行の版のあいだは旧い名前も返す', () => {
  it('SPEC-PDFSPEC-COMMON-ERRORS-004 引数の誤りの旧名', async () => {
    const { body } = await callError('get_requirements', badLevel);
    expect(body.detail?.legacyCode).toBe('VALIDATION_ERROR');
  });

  it('SPEC-PDFSPEC-COMMON-ERRORS-004 名前の変わらないコードに旧名は付かない', async () => {
    const { body } = await callError('get_section', { section: '7.1' });
    expect(body.detail).toBeUndefined();
  });
});
