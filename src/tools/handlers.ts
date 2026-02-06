/**
 * MCP Tool Handlers
 */

import { getSectionIndex, getSectionContent, searchSpec } from '../services/pdf-service.js';
import { validateSectionId, validateSearchQuery, validateMaxDepth, validateMaxResults } from '../utils/validation.js';
import type {
  GetStructureArgs,
  GetSectionArgs,
  SearchSpecArgs,
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
 * Tool handler registry
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const toolHandlers: Record<string, (args: any) => Promise<unknown>> = {
  get_structure: handleGetStructure,
  get_section: handleGetSection,
  search_spec: handleSearchSpec,
};
