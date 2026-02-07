/**
 * MCP Tool Handlers
 */

import {
  getSectionIndex,
  getSectionContent,
  searchSpec,
  getRequirements,
  getDefinitions,
  getTables,
} from '../services/pdf-service.js';
import {
  validateSectionId,
  validateSearchQuery,
  validateMaxDepth,
  validateMaxResults,
  validateRequirementLevel,
  validateTermQuery,
  validateTableIndex,
} from '../utils/validation.js';
import type {
  GetStructureArgs,
  GetSectionArgs,
  SearchSpecArgs,
  GetRequirementsArgs,
  GetDefinitionsArgs,
  GetTablesArgs,
  OutlineEntry,
  StructureResult,
} from '../types/index.js';

/**
 * get_structure handler
 */
async function handleGetStructure(args: GetStructureArgs): Promise<StructureResult> {
  const maxDepth = validateMaxDepth(args.max_depth);
  const index = await getSectionIndex();

  const sections = maxDepth ? pruneTree(index.tree, 0, maxDepth) : index.tree;

  return {
    title: 'ISO 32000-2:2020 (PDF 2.0)',
    totalPages: index.totalPages,
    totalSections: index.flatOrder.length,
    sections,
  };
}

/**
 * get_section handler
 */
async function handleGetSection(args: GetSectionArgs) {
  validateSectionId(args.section);
  return getSectionContent(args.section);
}

/**
 * search_spec handler
 */
async function handleSearchSpec(args: SearchSpecArgs) {
  validateSearchQuery(args.query);
  const maxResults = validateMaxResults(args.max_results);
  const hits = await searchSpec(args.query, maxResults);

  return {
    query: args.query,
    totalResults: hits.length,
    results: hits,
  };
}

/**
 * Prune outline tree to a maximum depth
 */
function pruneTree(entries: OutlineEntry[], depth: number, maxDepth: number): OutlineEntry[] {
  return entries.map((e) => ({
    ...e,
    children: depth + 1 < maxDepth ? pruneTree(e.children, depth + 1, maxDepth) : [],
  }));
}

/**
 * get_requirements handler
 */
async function handleGetRequirements(args: GetRequirementsArgs) {
  if (args.section !== undefined) {
    validateSectionId(args.section);
  }
  const level = validateRequirementLevel(args.level);
  return getRequirements(args.section, level);
}

/**
 * get_definitions handler
 */
async function handleGetDefinitions(args: GetDefinitionsArgs) {
  const term = validateTermQuery(args.term);
  return getDefinitions(term);
}

/**
 * get_tables handler
 */
async function handleGetTables(args: GetTablesArgs) {
  validateSectionId(args.section);
  const tableIndex = validateTableIndex(args.table_index);
  return getTables(args.section, tableIndex);
}

/**
 * Tool handler registry
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const toolHandlers: Record<string, (args: any) => Promise<unknown>> = {
  get_structure: handleGetStructure,
  get_section: handleGetSection,
  search_spec: handleSearchSpec,
  get_requirements: handleGetRequirements,
  get_definitions: handleGetDefinitions,
  get_tables: handleGetTables,
};
