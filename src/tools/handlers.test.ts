import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock pdf-service before importing handlers
vi.mock('../services/pdf-service.js', () => ({
  getSectionIndex: vi.fn(),
  getSectionContent: vi.fn(),
  searchSpec: vi.fn(),
}));

import { toolHandlers } from './handlers.js';
import { getSectionIndex, getSectionContent, searchSpec } from '../services/pdf-service.js';
import type { SectionIndex, SectionResult, SearchHit } from '../types/index.js';

const mockGetSectionIndex = vi.mocked(getSectionIndex);
const mockGetSectionContent = vi.mocked(getSectionContent);
const mockSearchSpec = vi.mocked(searchSpec);

describe('toolHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has handlers for all three tools', () => {
    expect(toolHandlers).toHaveProperty('get_structure');
    expect(toolHandlers).toHaveProperty('get_section');
    expect(toolHandlers).toHaveProperty('search_spec');
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
});
