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
  ensureRegistryInitialized,
  listSpecs,
  isSpecAvailable,
  getSpecInfo,
} from '../services/pdf-registry.js';
import { compareVersions } from '../services/compare-service.js';
import {
  validateSectionId,
  validateSearchQuery,
  validateMaxDepth,
  validateMaxResults,
  validateRequirementLevel,
  validateTermQuery,
  validateTableIndex,
  validateSpecId,
  validateCompareSection,
} from '../utils/validation.js';
import type {
  GetStructureArgs,
  GetSectionArgs,
  SearchSpecArgs,
  GetRequirementsArgs,
  GetDefinitionsArgs,
  GetTablesArgs,
  ListSpecsArgs,
  CompareVersionsArgs,
  OutlineEntry,
  StructureResult,
  ListSpecsResult,
  SpecCategory,
} from '../types/index.js';

// ========================================
// list_specs
// ========================================

async function handleListSpecs(args: ListSpecsArgs): Promise<ListSpecsResult> {
  await ensureRegistryInitialized();
  const specs = listSpecs(args.category as SpecCategory | undefined);
  return {
    totalSpecs: specs.length,
    specs,
  };
}

// ========================================
// get_structure
// ========================================

async function handleGetStructure(args: GetStructureArgs): Promise<StructureResult> {
  const specId = validateSpecId(args.spec);
  const maxDepth = validateMaxDepth(args.max_depth);
  await ensureRegistryInitialized();
  const index = await getSectionIndex(specId);

  const sections = maxDepth ? pruneTree(index.tree, 0, maxDepth) : index.tree;

  // Dynamic title from spec registry
  const specInfo = getSpecInfo(specId ?? 'iso32000-2');
  return {
    title: specInfo?.title ?? 'ISO 32000-2:2020 (PDF 2.0)',
    totalPages: index.totalPages,
    totalSections: index.flatOrder.length,
    sections,
  };
}

// ========================================
// get_section
// ========================================

async function handleGetSection(args: GetSectionArgs) {
  const specId = validateSpecId(args.spec);
  validateSectionId(args.section);
  await ensureRegistryInitialized();
  return getSectionContent(args.section, specId);
}

// ========================================
// search_spec
// ========================================

async function handleSearchSpec(args: SearchSpecArgs) {
  const specId = validateSpecId(args.spec);
  validateSearchQuery(args.query);
  const maxResults = validateMaxResults(args.max_results);
  await ensureRegistryInitialized();
  const hits = await searchSpec(args.query, maxResults, specId);

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

// ========================================
// get_requirements
// ========================================

async function handleGetRequirements(args: GetRequirementsArgs) {
  const specId = validateSpecId(args.spec);
  if (args.section !== undefined) {
    validateSectionId(args.section);
  }
  const level = validateRequirementLevel(args.level);
  await ensureRegistryInitialized();
  return getRequirements(args.section, level, specId);
}

// ========================================
// get_definitions
// ========================================

async function handleGetDefinitions(args: GetDefinitionsArgs) {
  const specId = validateSpecId(args.spec);
  const term = validateTermQuery(args.term);
  await ensureRegistryInitialized();
  return getDefinitions(term, specId);
}

// ========================================
// get_tables
// ========================================

async function handleGetTables(args: GetTablesArgs) {
  const specId = validateSpecId(args.spec);
  validateSectionId(args.section);
  const tableIndex = validateTableIndex(args.table_index);
  await ensureRegistryInitialized();
  return getTables(args.section, tableIndex, specId);
}

// ========================================
// compare_versions
// ========================================

async function handleCompareVersions(args: CompareVersionsArgs) {
  await ensureRegistryInitialized();

  // Prerequisite: both pdf17 and iso32000-2 must be available
  if (!isSpecAvailable('pdf17')) {
    throw new Error(
      'compare_versions requires PDF32000_2008.pdf in PDF_SPEC_DIR. ' +
        'Download it from https://opensource.adobe.com/dc-acrobat-sdk-docs/pdfstandards/PDF32000_2008.pdf'
    );
  }
  if (!isSpecAvailable('iso32000-2')) {
    throw new Error(
      'compare_versions requires ISO_32000-2_sponsored-ec2.pdf in PDF_SPEC_DIR. ' +
        'Download it from https://pdfa.org/resource/iso-32000-pdf/'
    );
  }

  const section = validateCompareSection(args.section);
  return compareVersions(section);
}

// ========================================
// Tool handler registry
// ========================================

/**
 * Type-safe mapping from tool name to its handler.
 * Each handler retains its specific argument and return types.
 *
 * The dynamic dispatch boundary (string → handler lookup) is handled
 * in index.ts where MCP SDK provides `args: Record<string, unknown>`.
 */
export const toolHandlers = {
  list_specs: handleListSpecs,
  get_structure: handleGetStructure,
  get_section: handleGetSection,
  search_spec: handleSearchSpec,
  get_requirements: handleGetRequirements,
  get_definitions: handleGetDefinitions,
  get_tables: handleGetTables,
  compare_versions: handleCompareVersions,
} as const;

/** Tool names recognized by this server */
export type ToolName = keyof typeof toolHandlers;
