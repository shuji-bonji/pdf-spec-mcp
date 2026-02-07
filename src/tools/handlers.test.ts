import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock pdf-service before importing handlers
vi.mock('../services/pdf-service.js', () => ({
  getSectionIndex: vi.fn(),
  getSectionContent: vi.fn(),
  searchSpec: vi.fn(),
  getRequirements: vi.fn(),
  getDefinitions: vi.fn(),
  getTables: vi.fn(),
}));

import { toolHandlers } from './handlers.js';
import {
  getSectionIndex,
  getSectionContent,
  searchSpec,
  getRequirements,
  getDefinitions,
  getTables,
} from '../services/pdf-service.js';
import type {
  SectionIndex,
  SectionResult,
  SearchHit,
  RequirementsResult,
  DefinitionsResult,
  TablesResult,
} from '../types/index.js';

const mockGetSectionIndex = vi.mocked(getSectionIndex);
const mockGetSectionContent = vi.mocked(getSectionContent);
const mockSearchSpec = vi.mocked(searchSpec);
const mockGetRequirements = vi.mocked(getRequirements);
const mockGetDefinitions = vi.mocked(getDefinitions);
const mockGetTables = vi.mocked(getTables);

describe('toolHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has handlers for all six tools', () => {
    expect(toolHandlers).toHaveProperty('get_structure');
    expect(toolHandlers).toHaveProperty('get_section');
    expect(toolHandlers).toHaveProperty('search_spec');
    expect(toolHandlers).toHaveProperty('get_requirements');
    expect(toolHandlers).toHaveProperty('get_definitions');
    expect(toolHandlers).toHaveProperty('get_tables');
  });

  describe('get_structure', () => {
    const mockIndex: SectionIndex = {
      tree: [
        {
          title: '7 Syntax',
          page: 50,
          sectionNumber: '7',
          children: [
            { title: '7.1 General', page: 50, sectionNumber: '7.1', children: [] },
            { title: '7.2 Lexical', page: 55, sectionNumber: '7.2', children: [] },
          ],
        },
        {
          title: '8 Graphics',
          page: 100,
          sectionNumber: '8',
          children: [],
        },
      ],
      sections: new Map(),
      flatOrder: [],
      totalPages: 1020,
    };

    beforeEach(() => {
      mockGetSectionIndex.mockResolvedValue(mockIndex);
    });

    it('returns full structure without max_depth', async () => {
      const result = await toolHandlers.get_structure({});
      expect(result).toHaveProperty('title');
      expect(result).toHaveProperty('totalPages', 1020);
      expect(result).toHaveProperty('sections');
    });

    it('prunes tree with max_depth=1', async () => {
      const result = (await toolHandlers.get_structure({ max_depth: 1 })) as {
        sections: Array<{ children: unknown[] }>;
      };
      // max_depth=1: top-level only, no children
      for (const section of result.sections) {
        expect(section.children).toEqual([]);
      }
    });

    it('rejects invalid max_depth', async () => {
      await expect(toolHandlers.get_structure({ max_depth: 0 })).rejects.toThrow();
      await expect(toolHandlers.get_structure({ max_depth: 11 })).rejects.toThrow();
    });
  });

  describe('get_section', () => {
    it('returns section content', async () => {
      const mockResult: SectionResult = {
        sectionNumber: '7.3.4',
        title: 'String objects',
        pageRange: { start: 62, end: 66 },
        content: [{ type: 'paragraph', text: 'Test content' }],
      };
      mockGetSectionContent.mockResolvedValue(mockResult);

      const result = await toolHandlers.get_section({ section: '7.3.4' });
      expect(result).toEqual(mockResult);
      expect(mockGetSectionContent).toHaveBeenCalledWith('7.3.4');
    });

    it('rejects missing section parameter', async () => {
      await expect(toolHandlers.get_section({})).rejects.toThrow();
    });

    it('rejects empty section string', async () => {
      await expect(toolHandlers.get_section({ section: '' })).rejects.toThrow('must not be empty');
    });
  });

  describe('search_spec', () => {
    it('returns search results', async () => {
      const mockHits: SearchHit[] = [
        { section: '12.8.1', title: 'General', page: 592, snippet: '...digital...', score: 5 },
      ];
      mockSearchSpec.mockResolvedValue(mockHits);

      const result = (await toolHandlers.search_spec({ query: 'digital signature' })) as {
        query: string;
        totalResults: number;
        results: SearchHit[];
      };
      expect(result.query).toBe('digital signature');
      expect(result.totalResults).toBe(1);
      expect(result.results).toEqual(mockHits);
    });

    it('uses default max_results of 10', async () => {
      mockSearchSpec.mockResolvedValue([]);
      await toolHandlers.search_spec({ query: 'test' });
      expect(mockSearchSpec).toHaveBeenCalledWith('test', 10);
    });

    it('passes custom max_results', async () => {
      mockSearchSpec.mockResolvedValue([]);
      await toolHandlers.search_spec({ query: 'test', max_results: 5 });
      expect(mockSearchSpec).toHaveBeenCalledWith('test', 5);
    });

    it('rejects missing query', async () => {
      await expect(toolHandlers.search_spec({})).rejects.toThrow();
    });

    it('rejects empty query', async () => {
      await expect(toolHandlers.search_spec({ query: '' })).rejects.toThrow('must not be empty');
    });
  });

  describe('get_requirements', () => {
    const mockResult: RequirementsResult = {
      filter: { section: '7.3', level: 'all' },
      totalRequirements: 2,
      statistics: { shall: 1, may: 1 },
      requirements: [
        {
          id: 'R-7.3-1',
          level: 'shall',
          text: 'The value shall be positive.',
          section: '7.3',
          sectionTitle: 'Objects',
        },
        {
          id: 'R-7.3-2',
          level: 'may',
          text: 'The reader may cache.',
          section: '7.3',
          sectionTitle: 'Objects',
        },
      ],
    };

    it('returns requirements with section filter', async () => {
      mockGetRequirements.mockResolvedValue(mockResult);
      const result = await toolHandlers.get_requirements({ section: '7.3' });
      expect(result).toEqual(mockResult);
      expect(mockGetRequirements).toHaveBeenCalledWith('7.3', undefined);
    });

    it('passes level filter', async () => {
      mockGetRequirements.mockResolvedValue({ ...mockResult, totalRequirements: 1 });
      await toolHandlers.get_requirements({ section: '7.3', level: 'shall' });
      expect(mockGetRequirements).toHaveBeenCalledWith('7.3', 'shall');
    });

    it('works without any filters', async () => {
      mockGetRequirements.mockResolvedValue(mockResult);
      await toolHandlers.get_requirements({});
      expect(mockGetRequirements).toHaveBeenCalledWith(undefined, undefined);
    });

    it('rejects invalid level', async () => {
      await expect(toolHandlers.get_requirements({ level: 'invalid' })).rejects.toThrow(
        'Invalid requirement level'
      );
    });

    it('rejects empty section string', async () => {
      await expect(toolHandlers.get_requirements({ section: '' })).rejects.toThrow(
        'must not be empty'
      );
    });
  });

  describe('get_definitions', () => {
    const mockResult: DefinitionsResult = {
      totalDefinitions: 2,
      definitions: [
        { term: 'font', definition: 'A collection of glyphs.', section: '3.5' },
        { term: 'glyph', definition: 'A graphical shape.', section: '3.10' },
      ],
    };

    it('returns all definitions without term filter', async () => {
      mockGetDefinitions.mockResolvedValue(mockResult);
      const result = await toolHandlers.get_definitions({});
      expect(result).toEqual(mockResult);
      expect(mockGetDefinitions).toHaveBeenCalledWith(undefined);
    });

    it('passes term filter', async () => {
      mockGetDefinitions.mockResolvedValue({ ...mockResult, totalDefinitions: 1 });
      await toolHandlers.get_definitions({ term: 'font' });
      expect(mockGetDefinitions).toHaveBeenCalledWith('font');
    });

    it('rejects empty term string', async () => {
      await expect(toolHandlers.get_definitions({ term: '' })).rejects.toThrow('must not be empty');
    });
  });

  describe('get_tables', () => {
    const mockResult: TablesResult = {
      section: '7.2.3',
      sectionTitle: 'White-space characters',
      totalTables: 1,
      tables: [
        {
          index: 0,
          caption: 'Table 1 — White-space characters',
          headers: ['Code', 'Name'],
          rows: [['0x09', 'TAB']],
        },
      ],
    };

    it('returns all tables in a section', async () => {
      mockGetTables.mockResolvedValue(mockResult);
      const result = await toolHandlers.get_tables({ section: '7.2.3' });
      expect(result).toEqual(mockResult);
      expect(mockGetTables).toHaveBeenCalledWith('7.2.3', undefined);
    });

    it('passes table_index', async () => {
      mockGetTables.mockResolvedValue(mockResult);
      await toolHandlers.get_tables({ section: '7.2.3', table_index: 0 });
      expect(mockGetTables).toHaveBeenCalledWith('7.2.3', 0);
    });

    it('rejects missing section parameter', async () => {
      await expect(toolHandlers.get_tables({})).rejects.toThrow();
    });

    it('rejects empty section string', async () => {
      await expect(toolHandlers.get_tables({ section: '' })).rejects.toThrow('must not be empty');
    });

    it('rejects negative table_index', async () => {
      await expect(toolHandlers.get_tables({ section: '7.2.3', table_index: -1 })).rejects.toThrow(
        'non-negative integer'
      );
    });
  });
});
