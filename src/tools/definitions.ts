/**
 * MCP Tool Definitions
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';

/** Common spec parameter description shared by all spec-aware tools */
const SPEC_PARAM = {
  type: 'string' as const,
  description:
    'Specification ID (e.g., "iso32000-2", "ts32002", "pdfua2"). ' +
    'Use list_specs to see available specs. Default: "iso32000-2" (PDF 2.0).',
};

export const tools: Tool[] = [
  // ========================================
  // Discovery
  // ========================================
  {
    name: 'list_specs',
    description:
      'List all available PDF specification documents. ' +
      'Returns document IDs, titles, page counts, and categories. ' +
      'Use the returned IDs as the `spec` parameter in other tools.',
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'Filter by document category.',
          enum: ['standard', 'ts', 'pdfua', 'guide', 'appnote'],
        },
      },
    },
  },

  // ========================================
  // Structure & Content
  // ========================================
  {
    name: 'get_structure',
    description:
      'Get the section hierarchy of the PDF specification (ISO 32000-2). ' +
      'Returns the table of contents with section numbers, titles, and page numbers.',
    inputSchema: {
      type: 'object',
      properties: {
        spec: SPEC_PARAM,
        max_depth: {
          type: 'number',
          description:
            'Maximum depth of the hierarchy to return (default: all levels). ' +
            '1 = top-level only, 2 = top + sub-sections, etc.',
        },
      },
    },
  },
  {
    name: 'get_section',
    description:
      'Get the content of a specific section from the PDF specification (ISO 32000-2). ' +
      'Returns structured content including headings, paragraphs, lists, tables, and notes.',
    inputSchema: {
      type: 'object',
      properties: {
        spec: SPEC_PARAM,
        section: {
          type: 'string',
          description: 'Section identifier (e.g., "7.3.4", "12.8", "Annex A", "Foreword")',
        },
      },
      required: ['section'],
    },
  },

  // ========================================
  // Search
  // ========================================
  {
    name: 'search_spec',
    description:
      'Search the PDF specification (ISO 32000-2) for a keyword or phrase. ' +
      'Returns matching sections with context snippets. ' +
      'The first call may take a few seconds to build the search index.',
    inputSchema: {
      type: 'object',
      properties: {
        spec: SPEC_PARAM,
        query: {
          type: 'string',
          description: 'Search query (keyword or phrase)',
        },
        max_results: {
          type: 'number',
          description: 'Maximum number of results to return (default: 10, max: 50)',
        },
      },
      required: ['query'],
    },
  },

  // ========================================
  // Analysis
  // ========================================
  {
    name: 'get_requirements',
    description:
      'Extract normative requirements (shall/must/may) from the PDF specification (ISO 32000-2). ' +
      'Returns structured requirements with the sentence context, section, and requirement level.',
    inputSchema: {
      type: 'object',
      properties: {
        spec: SPEC_PARAM,
        section: {
          type: 'string',
          description:
            'Filter by section number (e.g., "7.3.4", "12.8"). ' +
            'Includes subsections. If omitted, scans all sections (slower on first call).',
        },
        level: {
          type: 'string',
          description: 'Filter by requirement level.',
          enum: ['shall', 'shall not', 'should', 'should not', 'may'],
        },
      },
    },
  },
  {
    name: 'get_definitions',
    description:
      'Get term definitions from Section 3 of the PDF specification (ISO 32000-2). ' +
      'Returns structured definitions with term, definition text, notes, and sources.',
    inputSchema: {
      type: 'object',
      properties: {
        spec: SPEC_PARAM,
        term: {
          type: 'string',
          description:
            'Search for a specific term by keyword (case-insensitive substring match). ' +
            'If omitted, returns all definitions.',
        },
      },
    },
  },
  {
    name: 'get_tables',
    description:
      'Extract table structures from a specified section of the PDF specification (ISO 32000-2). ' +
      'Returns tables with headers, rows, and optional captions.',
    inputSchema: {
      type: 'object',
      properties: {
        spec: SPEC_PARAM,
        section: {
          type: 'string',
          description: 'Section identifier (e.g., "7.3.4", "12.8", "Annex A")',
        },
        table_index: {
          type: 'number',
          description:
            'Optional 0-based index to retrieve a specific table. ' +
            'If omitted, returns all tables in the section.',
        },
      },
      required: ['section'],
    },
  },

  // ========================================
  // Version Comparison
  // ========================================
  {
    name: 'compare_versions',
    description:
      'Compare sections between PDF 1.7 (ISO 32000-1) and PDF 2.0 (ISO 32000-2). ' +
      'Returns matched sections (same or moved), added sections (new in 2.0), ' +
      'and removed sections (absent in 2.0). Uses title-based automatic matching.',
    inputSchema: {
      type: 'object',
      properties: {
        section: {
          type: 'string',
          description:
            'Compare a specific section and its subsections (e.g., "12.8" for Digital Signatures). ' +
            'Uses PDF 2.0 section numbering. If omitted, compares all top-level sections.',
        },
      },
    },
  },
];
