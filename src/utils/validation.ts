/**
 * Input Validation Utilities
 */

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

export function validateSectionId(section: unknown): asserts section is string {
  if (typeof section !== 'string') {
    throw new ValidationError(`Section must be a string, got ${typeof section}`);
  }
  if (section.trim().length === 0) {
    throw new ValidationError('Section must not be empty');
  }
}

export function validateSearchQuery(query: unknown): asserts query is string {
  if (typeof query !== 'string') {
    throw new ValidationError(`Query must be a string, got ${typeof query}`);
  }
  if (query.trim().length === 0) {
    throw new ValidationError('Query must not be empty');
  }
  if (query.length > queryMaxLength) {
    throw new ValidationError(`Query too long (max ${queryMaxLength} characters)`);
  }
}

export function validateMaxDepth(depth: unknown): number | undefined {
  if (depth === undefined || depth === null) return undefined;
  if (
    typeof depth !== 'number' ||
    !Number.isInteger(depth) ||
    depth < maxDepthRange.min ||
    depth > maxDepthRange.max
  ) {
    throw new ValidationError(
      `max_depth must be an integer between ${maxDepthRange.min} and ${maxDepthRange.max}, got ${depth}`
    );
  }
  return depth;
}

export function validateMaxResults(max: unknown): number {
  if (max === undefined || max === null) return defaultMaxResults;
  if (
    typeof max !== 'number' ||
    !Number.isInteger(max) ||
    max < maxResultsRange.min ||
    max > maxResultsRange.max
  ) {
    throw new ValidationError(
      `max_results must be an integer between ${maxResultsRange.min} and ${maxResultsRange.max}, got ${max}`
    );
  }
  return max;
}

const VALID_REQUIREMENT_LEVELS: ISORequirementLevel[] = [
  'shall',
  'shall not',
  'should',
  'should not',
  'may',
];

export function validateRequirementLevel(level: unknown): ISORequirementLevel | undefined {
  if (level === undefined || level === null) return undefined;
  if (typeof level !== 'string') {
    throw new ValidationError(`level must be a string, got ${typeof level}`);
  }
  const normalized = level.toLowerCase().trim() as ISORequirementLevel;
  if (!VALID_REQUIREMENT_LEVELS.includes(normalized)) {
    throw new ValidationError(
      `Invalid requirement level "${level}". Valid levels: ${VALID_REQUIREMENT_LEVELS.join(', ')}`
    );
  }
  return normalized;
}

export function validateTermQuery(term: unknown): string | undefined {
  if (term === undefined || term === null) return undefined;
  if (typeof term !== 'string') {
    throw new ValidationError(`term must be a string, got ${typeof term}`);
  }
  if (term.trim().length === 0) {
    throw new ValidationError('term must not be empty');
  }
  if (term.length > termMaxLength) {
    throw new ValidationError(`term too long (max ${termMaxLength} characters)`);
  }
  return term.trim();
}

export function validateTableIndex(index: unknown): number | undefined {
  if (index === undefined || index === null) return undefined;
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) {
    throw new ValidationError(`table_index must be a non-negative integer, got ${index}`);
  }
  return index;
}

/**
 * Validate spec ID parameter.
 * Returns undefined if not provided (caller should use DEFAULT_SPEC_ID via resolveSpecId).
 */
export function validateSpecId(specId: unknown): string | undefined {
  if (specId === undefined || specId === null) return undefined;
  if (typeof specId !== 'string' || specId.length === 0) {
    throw new ValidationError('spec must be a non-empty string');
  }
  if (specId.length > specIdMaxLength) {
    throw new ValidationError(`spec must be ${specIdMaxLength} characters or less`);
  }
  return specId;
}

/**
 * Validate section parameter for compare_versions.
 * Returns undefined if not provided (compare all sections).
 */
export function validateCompareSection(section: unknown): string | undefined {
  if (section === undefined || section === null) return undefined;
  validateSectionId(section);
  return section as string;
}
