/**
 * MCP Tool Definitions (A-4: the registry behind McpServer + registerTool)
 *
 * Input schemas are derived from the Zod shapes in utils/validation.ts — the published
 * schema and the runtime check have one source. Implementations live in handlers.ts.
 *
 * annotations (規約 §2.1):
 *   - readOnlyHint: true for every tool. This server only reads specification PDFs; nothing
 *     it exposes can alter the corpus or any other state.
 *   - destructiveHint / idempotentHint: reads are neither destructive nor
 *     state-dependent — the same arguments always yield the same answer for a given corpus.
 *   - openWorldHint: false. Answers come from PDFs on disk, not from the network.
 */

import type { ZodObject } from 'zod';
import {
  CompareVersionsSchema,
  GetDefinitionsSchema,
  GetRequirementsSchema,
  GetSectionSchema,
  GetStructureSchema,
  GetTablesSchema,
  ListSpecsSchema,
  SearchSpecSchema,
} from '../utils/validation.js';

export interface ToolAnnotations {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
}

export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  /**
   * `registerTool` に渡す入力スキーマ。
   *
   * SDK v2 は raw shape を受け付けない（型が合わず、移行ガイドも非推奨としている）。
   * ZodObject をそのまま渡す。
   */
  // biome-ignore lint/suspicious/noExplicitAny: ツールごとに形が違う ZodObject をまとめて持つ
  inputSchema: ZodObject<any>;
  annotations: ToolAnnotations;
}

/** Every tool in this server reads; none of them writes or reaches the network. */
const READ_ONLY: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

export const tools: ToolDefinition[] = [
  // ========================================
  // Discovery
  // ========================================
  {
    name: 'list_specs',
    title: 'List available specifications',
    description:
      'List all available PDF specification documents. ' +
      'Returns document IDs, titles, page counts, and categories, plus `coverage.gaps` — ' +
      'the normative areas this corpus does NOT contain (PDF/A, PAdES). ' +
      'Read the gaps before concluding that a requirement does not exist. ' +
      'Use the returned IDs as the `spec` parameter in other tools.',
    inputSchema: ListSpecsSchema,
    annotations: READ_ONLY,
  },
  {
    name: 'get_structure',
    title: 'Get section hierarchy',
    description:
      'Get the section hierarchy of the PDF specification (ISO 32000-2). ' +
      'Returns the table of contents with section numbers, titles, and page numbers.',
    inputSchema: GetStructureSchema,
    annotations: READ_ONLY,
  },

  // ========================================
  // Reading
  // ========================================
  {
    name: 'get_section',
    title: 'Get section content',
    description:
      'Get the content of a specific section from the PDF specification (ISO 32000-2). ' +
      'Returns structured content including headings, paragraphs, lists, tables, and notes. ' +
      'A parent section returns its entire subtree (all subsections, in document order); ' +
      'top-level clauses can therefore return very large responses — prefer the most ' +
      'specific section number you know.',
    inputSchema: GetSectionSchema,
    annotations: READ_ONLY,
  },
  {
    name: 'search_spec',
    title: 'Search the specification',
    description:
      'Search the PDF specification (ISO 32000-2) for a keyword or phrase. ' +
      'Returns matching sections with context snippets. ' +
      'The first call may take a few seconds to build the search index; it is then cached on disk, ' +
      'so later processes start warm. ' +
      'No hits means "this corpus cannot answer", NOT "no such requirement exists" — ' +
      'ISO 19005 (PDF/A) and ETSI PAdES are outside it (see list_specs -> coverage.gaps).',
    inputSchema: SearchSpecSchema,
    annotations: READ_ONLY,
  },

  // ========================================
  // Structured extraction
  // ========================================
  {
    name: 'get_requirements',
    title: 'Extract normative requirements',
    description:
      'Reads the STANDARD, not your file. ' +
      'Extract normative requirements (shall/must/may) from the PDF specification (ISO 32000-2). ' +
      'Returns structured requirements with the sentence context, section, and requirement level. ' +
      'It tells you what the specification requires, never whether a given PDF satisfies it — ' +
      'to check a file, use pdf-verify-mcp (validate_conformance / evaluate_policy).',
    inputSchema: GetRequirementsSchema,
    annotations: READ_ONLY,
  },
  {
    name: 'get_definitions',
    title: 'Get term definitions',
    description:
      'Get term definitions from Section 3 of the PDF specification (ISO 32000-2). ' +
      'Returns structured definitions with term, definition text, notes, and sources.',
    inputSchema: GetDefinitionsSchema,
    annotations: READ_ONLY,
  },
  {
    name: 'get_tables',
    title: 'Extract tables',
    description:
      'Extract table structures from a specified section of the PDF specification (ISO 32000-2). ' +
      'Returns tables with headers, rows, and optional captions. ' +
      'A parent section returns the tables of its entire subtree (all subsections).',
    inputSchema: GetTablesSchema,
    annotations: READ_ONLY,
  },

  // ========================================
  // Comparison
  // ========================================
  {
    name: 'compare_versions',
    title: 'Compare PDF 1.7 and PDF 2.0',
    description:
      'Compare sections between PDF 1.7 (ISO 32000-1) and PDF 2.0 (ISO 32000-2). ' +
      'Returns matched sections (same or moved), added sections (new in 2.0), ' +
      'and removed sections (absent in 2.0). Uses title-based automatic matching.',
    inputSchema: CompareVersionsSchema,
    annotations: READ_ONLY,
  },
];
