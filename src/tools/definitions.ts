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
];
