/**
 * 応答が、使った仕様の id を名指すこと（common-output。pdf-spec-mcp#32・F-30）。
 *
 * 仕様書の PDF が要らないよう、pdf-service と compare-service を差し替えて handlers を呼ぶ
 * （handlers.test.ts と同じ手）。registry の resolveSpecId は本物と同じく既定の id を返す。
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('./services/pdf-service.js', () => ({
  getSectionIndex: vi.fn(async () => ({ tree: [], flatOrder: [], totalPages: 1 })),
  getSectionContent: vi.fn(async () => ({ sectionNumber: '7.1', title: 't', content: [] })),
  searchSpec: vi.fn(async () => []),
  getRequirements: vi.fn(async () => ({ requirements: [] })),
  getDefinitions: vi.fn(async () => ({ definitions: [] })),
  getTables: vi.fn(async () => ({ tables: [] })),
}));
vi.mock('./services/pdf-registry.js', () => ({
  ensureRegistryInitialized: vi.fn().mockResolvedValue(undefined),
  listSpecs: vi.fn().mockReturnValue([]),
  isSpecAvailable: vi.fn().mockReturnValue(true),
  getSpecInfo: vi
    .fn()
    .mockReturnValue({ id: 'iso32000-2', title: 'ISO 32000-2', category: 'standard' }),
  getUnrecognizedFiles: vi.fn().mockReturnValue([]),
  resolveSpecId: vi.fn((id?: string) => id ?? 'iso32000-2'),
}));
vi.mock('./services/compare-service.js', () => ({
  compareVersions: vi.fn(async () => ({ sections: [] })),
}));

import { toolHandlers } from './tools/handlers.js';

const call = async (tool: keyof typeof toolHandlers, args: Record<string, unknown>) =>
  (await toolHandlers[tool](args as never)) as unknown as Record<string, unknown>;

describe('SPEC-PDFSPEC-COMMON-OUTPUT-001 応答に、使った仕様の id を返す', () => {
  it('SPEC-PDFSPEC-COMMON-OUTPUT-001 spec を省いた search_spec', async () => {
    const result = await call('search_spec', { query: 'shall' });
    expect(Object.keys(result)[0]).toBe('spec');
    expect(result.spec).toBe('iso32000-2');
  });

  it('SPEC-PDFSPEC-COMMON-OUTPUT-001 spec を渡した get_section', async () => {
    const result = await call('get_section', { section: '7.1', spec: 'pdf17' });
    expect(result.spec).toBe('pdf17');
  });

  for (const [tool, args] of [
    ['get_structure', {}],
    ['get_requirements', {}],
    ['get_definitions', {}],
    ['get_tables', { section: '7.1' }],
  ] as const) {
    it(`SPEC-PDFSPEC-COMMON-OUTPUT-001 spec を省いた ${tool}`, async () => {
      const result = await call(tool, args);
      expect(Object.keys(result)[0]).toBe('spec');
      expect(result.spec).toBe('iso32000-2');
    });
  }

  it('SPEC-PDFSPEC-COMMON-OUTPUT-001 compare_versions は 2 つの id を返す', async () => {
    const result = await call('compare_versions', {});
    expect(result.specs).toEqual(['pdf17', 'iso32000-2']);
  });
});
