/**
 * MCP Tool Definitions
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export const tools: Tool[] = [
  {
    name: 'get_structure',
    description:
      'Get the section hierarchy of the PDF specification (ISO 32000-2). ' +
      'Returns the table of contents with section numbers, titles, and page numbers.',
    inputSchema: {
      type: 'object',
      properties: {
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
        section: {
          type: 'string',
          description: 'Section identifier (e.g., "7.3.4", "12.8", "Annex A", "Foreword")',
        },
      },
      required: ['section'],
    },
  },
  {
    name: 'search_spec',
    description:
      'Search the PDF specification (ISO 32000-2) for a keyword or phrase. ' +
      'Returns matching sections with context snippets. ' +
      'The first call may take a few seconds to build the search index.',
    inputSchema: {
      type: 'object',
      properties: {
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
  {
    name: 'get_requirements',
    description:
      'Extract normative requirements (shall/must/may) from the PDF specification (ISO 32000-2). ' +
      'Returns structured requirements with the sentence context, section, and requirement level.',
    inputSchema: {
      type: 'object',
      properties: {
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
];
