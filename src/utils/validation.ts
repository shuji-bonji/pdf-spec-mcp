/**
 * Input Validation — Zod schemas as the single source of truth (A-4)
 *
 * Previously the same constraints were maintained twice: hand-written `assert` helpers
 * here, and a hand-written JSON Schema in definitions.ts. They could drift — the published
 * schema saying one thing while the runtime check enforced another. From this version the
 * Zod schema is the one source both are derived from:
 *   - the schema published to MCP (definitions.ts hands the shape to registerTool)
 *   - the runtime check (handlers.ts parses with the same schema)
 * Limits stay in config.ts (VALIDATION_LIMITS).
 *
 * Field descriptions live here too, so a tool's advertised argument and the check that
 * enforces it cannot disagree.
 */

import { z } from 'zod';
import { VALIDATION_LIMITS } from '../config.js';
import { ValidationError } from '../errors.js';
import type { ISORequirementLevel } from '../types/index.js';

const {
  queryMaxLength,
  termMaxLength,
  specIdMaxLength,
  maxDepthRange,
  maxResultsRange,
  defaultMaxResults,
} = VALIDATION_LIMITS;

// ---------------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------------

/** Spec id. Optional everywhere: omitted means the default spec (see resolveSpecId). */
const zSpec = z
  .string()
  .min(1, 'spec must be a non-empty string')
  .max(specIdMaxLength, `spec must be ${specIdMaxLength} characters or less`)
  .optional()
  .describe('Spec ID (e.g. "iso32000-2", "pdf17"). Omit for the default spec.');

/**
 * Section identifier such as "12.5.6.10" or "Annex A".
 *
 * The trim check is not decoration: `min(1)` alone would let "   " through, which the
 * hand-written validator rejected. Use this everywhere a section is accepted.
 */
const zSection = z
  .string()
  .min(1, 'Section must not be empty')
  .refine((v) => v.trim().length > 0, 'Section must not be empty');

export const REQUIREMENT_LEVELS: [ISORequirementLevel, ...ISORequirementLevel[]] = [
  'shall',
  'shall not',
  'should',
  'should not',
  'may',
];

// ---------------------------------------------------------------------------
// Per-tool shapes
//
// Exported as raw shapes (not full schemas) because registerTool takes a shape and turns
// it into the published JSON Schema. The matching full schema is exported alongside for
// handlers to parse with.
// ---------------------------------------------------------------------------

export const listSpecsShape = {
  category: z
    .string()
    .optional()
    .describe('Filter by category (standard, ts, pdfua, guide, appnote).'),
};
export const ListSpecsSchema = z.object(listSpecsShape);

export const getStructureShape = {
  spec: zSpec,
  max_depth: z
    .number()
    .int()
    .min(maxDepthRange.min)
    .max(maxDepthRange.max)
    .optional()
    .describe(`Maximum heading depth to return (${maxDepthRange.min}-${maxDepthRange.max}).`),
};
export const GetStructureSchema = z.object(getStructureShape);

export const getSectionShape = {
  spec: zSpec,
  section: zSection.describe('Section number, e.g. "12.5.6.10" or "Annex A".'),
};
export const GetSectionSchema = z.object(getSectionShape);

export const searchSpecShape = {
  spec: zSpec,
  query: z
    .string()
    .min(1, 'Query must not be empty')
    .max(queryMaxLength, `Query too long (max ${queryMaxLength} characters)`)
    .refine((q) => q.trim().length > 0, 'Query must not be empty')
    .describe('Search terms. Matched as an exact phrase first, then as AND over the words.'),
  max_results: z
    .number()
    .int()
    .min(maxResultsRange.min)
    .max(maxResultsRange.max)
    .optional()
    .describe(`Maximum hits to return (${maxResultsRange.min}-${maxResultsRange.max}).`),
};
export const SearchSpecSchema = z.object(searchSpecShape);

export const getRequirementsShape = {
  spec: zSpec,
  section: zSection.optional().describe('Limit to this section and its subsections.'),
  level: z
    .string()
    .optional()
    .describe(`Filter by requirement level (${REQUIREMENT_LEVELS.join(', ')}).`),
};
export const GetRequirementsSchema = z.object(getRequirementsShape);

export const getDefinitionsShape = {
  spec: zSpec,
  term: z
    .string()
    .min(1, 'term must not be empty')
    .max(termMaxLength, `term too long (max ${termMaxLength} characters)`)
    .refine((t) => t.trim().length > 0, 'term must not be empty')
    .optional()
    .describe('Filter to definitions matching this term.'),
};
export const GetDefinitionsSchema = z.object(getDefinitionsShape);

export const getTablesShape = {
  spec: zSpec,
  section: zSection.describe('Section number containing the table(s).'),
  table_index: z
    .number()
    .int()
    .min(0, 'table_index must be a non-negative integer')
    .optional()
    .describe('Return only this table (0-based). Omit for all tables in the section.'),
};
export const GetTablesSchema = z.object(getTablesShape);

export const compareVersionsShape = {
  section: zSection.optional().describe('Limit the comparison to this section subtree.'),
};
export const CompareVersionsSchema = z.object(compareVersionsShape);

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Parse tool arguments, reporting failures as ValidationError.
 *
 * The SDK validates against the published shape too, but this stays the enforcement point:
 * it is what runs for callers reaching a handler directly (unit tests included), and it
 * turns a Zod failure into the same structured error as every other rejection.
 */
export function parseArgs<T extends z.ZodType>(schema: T, args: unknown): z.infer<T> {
  const result = schema.safeParse(args);
  if (!result.success) {
    const detail = result.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    throw new ValidationError(detail);
  }
  return result.data;
}

/**
 * Normalise a requirement level.
 *
 * Kept out of the Zod schema as a plain enum so that case and stray whitespace are still
 * forgiven ("SHALL " → "shall"), which the hand-written validator did and callers rely on.
 * The published schema advertises the accepted values in its description.
 */
export function normalizeRequirementLevel(level?: string): ISORequirementLevel | undefined {
  if (level === undefined || level === null) return undefined;
  const normalized = level.toLowerCase().trim() as ISORequirementLevel;
  if (!REQUIREMENT_LEVELS.includes(normalized)) {
    throw new ValidationError(
      `Invalid requirement level "${level}". Valid levels: ${REQUIREMENT_LEVELS.join(', ')}`,
    );
  }
  return normalized;
}

/** Default applied when max_results is omitted. */
export function resolveMaxResults(max?: number): number {
  return max ?? defaultMaxResults;
}

/** Trim a term the way the previous hand-written validator did. */
export function normalizeTerm(term?: string): string | undefined {
  return term?.trim();
}
