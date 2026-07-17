/**
 * MCP Tool Handlers
 *
 * Adding a tool takes three edits:
 *   1. a Zod shape + schema in utils/validation.ts
 *   2. one entry in the definitions.ts registry
 *   3. a handleXxx here, plus a line in toolHandlers
 *
 * Every handler parses its arguments with parseArgs before doing anything. The SDK also
 * checks the published shape, but handlers are called directly in tests too, and parseArgs
 * is what turns a bad argument into the family's structured VALIDATION_ERROR.
 */

import { COVERAGE_GAPS } from '../config.js';
import { NEXT_ACTIONS, ToolPrerequisiteError } from '../errors.js';
import { compareVersions } from '../services/compare-service.js';
import {
  ensureRegistryInitialized,
  getSpecInfo,
  isSpecAvailable,
  listSpecs,
} from '../services/pdf-registry.js';
import {
  getDefinitions,
  getRequirements,
  getSectionContent,
  getSectionIndex,
  getTables,
  searchSpec,
} from '../services/pdf-service.js';
import type {
  ListSpecsResult,
  OutlineEntry,
  SpecCategory,
  StructureResult,
} from '../types/index.js';
import {
  CompareVersionsSchema,
  GetDefinitionsSchema,
  GetRequirementsSchema,
  GetSectionSchema,
  GetStructureSchema,
  GetTablesSchema,
  ListSpecsSchema,
  normalizeRequirementLevel,
  normalizeTerm,
  parseArgs,
  resolveMaxResults,
  SearchSpecSchema,
} from '../utils/validation.js';

// ========================================
// list_specs
// ========================================

async function handleListSpecs(rawArgs: unknown): Promise<ListSpecsResult> {
  const args = parseArgs(ListSpecsSchema, rawArgs);
  await ensureRegistryInitialized();
  const specs = listSpecs(args.category as SpecCategory | undefined);
  return {
    totalSpecs: specs.length,
    specs,
    // Reported unconditionally, including when a category filter is in play: the gaps are
    // properties of the corpus, not of the current query.
    coverage: {
      note:
        'These normative areas are outside this corpus. A search returning no hits for them ' +
        'means "cannot answer", not "no such requirement".',
      gaps: COVERAGE_GAPS,
    },
  };
}

// ========================================
// get_structure
// ========================================

async function handleGetStructure(rawArgs: unknown): Promise<StructureResult> {
  const { spec: specId, max_depth: maxDepth } = parseArgs(GetStructureSchema, rawArgs);
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

async function handleGetSection(rawArgs: unknown) {
  const args = parseArgs(GetSectionSchema, rawArgs);
  await ensureRegistryInitialized();
  return getSectionContent(args.section, args.spec);
}

// ========================================
// search_spec
// ========================================

async function handleSearchSpec(rawArgs: unknown) {
  const args = parseArgs(SearchSpecSchema, rawArgs);
  const maxResults = resolveMaxResults(args.max_results);
  await ensureRegistryInitialized();
  const hits = await searchSpec(args.query, maxResults, args.spec);

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

async function handleGetRequirements(rawArgs: unknown) {
  const args = parseArgs(GetRequirementsSchema, rawArgs);
  const level = normalizeRequirementLevel(args.level);
  await ensureRegistryInitialized();
  return getRequirements(args.section, level, args.spec);
}

// ========================================
// get_definitions
// ========================================

async function handleGetDefinitions(rawArgs: unknown) {
  const args = parseArgs(GetDefinitionsSchema, rawArgs);
  await ensureRegistryInitialized();
  return getDefinitions(normalizeTerm(args.term), args.spec);
}

// ========================================
// get_tables
// ========================================

async function handleGetTables(rawArgs: unknown) {
  const args = parseArgs(GetTablesSchema, rawArgs);
  await ensureRegistryInitialized();
  return getTables(args.section, args.table_index, args.spec);
}

// ========================================
// compare_versions
// ========================================

async function handleCompareVersions(rawArgs: unknown) {
  const args = parseArgs(CompareVersionsSchema, rawArgs);
  await ensureRegistryInitialized();

  // Prerequisite: both pdf17 and iso32000-2 must be available
  if (!isSpecAvailable('pdf17')) {
    throw new ToolPrerequisiteError(
      'compare_versions requires PDF32000_2008.pdf in PDF_SPEC_DIR. ' +
        'Download it from https://opensource.adobe.com/dc-acrobat-sdk-docs/pdfstandards/PDF32000_2008.pdf',
      {
        hint: 'compare_versions diffs PDF 1.7 against PDF 2.0, so both PDFs must be present.',
        next_actions: [
          NEXT_ACTIONS.downloadSpec(
            'PDF32000_2008.pdf',
            'https://opensource.adobe.com/dc-acrobat-sdk-docs/pdfstandards/PDF32000_2008.pdf',
          ),
        ],
      },
    );
  }
  if (!isSpecAvailable('iso32000-2')) {
    throw new ToolPrerequisiteError(
      'compare_versions requires ISO_32000-2_sponsored-ec2.pdf in PDF_SPEC_DIR. ' +
        'Download it from https://pdfa.org/resource/iso-32000-pdf/',
      {
        hint: 'compare_versions diffs PDF 1.7 against PDF 2.0, so both PDFs must be present.',
        next_actions: [
          NEXT_ACTIONS.downloadSpec(
            'ISO_32000-2_sponsored_EC3.pdf',
            'https://pdfa.org/resource/iso-32000-pdf/',
          ),
        ],
      },
    );
  }

  return compareVersions(args.section);
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
