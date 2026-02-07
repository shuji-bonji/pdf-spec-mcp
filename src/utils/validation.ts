/**
 * Input Validation Utilities
 */

import type { ISORequirementLevel } from '../types/index.js';

export function validateSectionId(section: unknown): asserts section is string {
  if (typeof section !== 'string') {
    throw new Error(`Section must be a string, got ${typeof section}`);
  }
  if (section.trim().length === 0) {
    throw new Error('Section must not be empty');
  }
}

export function validateSearchQuery(query: unknown): asserts query is string {
  if (typeof query !== 'string') {
    throw new Error(`Query must be a string, got ${typeof query}`);
  }
  if (query.trim().length === 0) {
    throw new Error('Query must not be empty');
  }
  if (query.length > 500) {
    throw new Error('Query too long (max 500 characters)');
  }
}

export function validateMaxDepth(depth: unknown): number | undefined {
  if (depth === undefined || depth === null) return undefined;
  if (typeof depth !== 'number' || !Number.isInteger(depth) || depth < 1 || depth > 10) {
    throw new Error(`max_depth must be an integer between 1 and 10, got ${depth}`);
  }
  return depth;
}

export function validateMaxResults(max: unknown): number {
  if (max === undefined || max === null) return 10;
  if (typeof max !== 'number' || !Number.isInteger(max) || max < 1 || max > 50) {
    throw new Error(`max_results must be an integer between 1 and 50, got ${max}`);
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
    throw new Error(`level must be a string, got ${typeof level}`);
  }
  const normalized = level.toLowerCase().trim() as ISORequirementLevel;
  if (!VALID_REQUIREMENT_LEVELS.includes(normalized)) {
    throw new Error(
      `Invalid requirement level "${level}". Valid levels: ${VALID_REQUIREMENT_LEVELS.join(', ')}`
    );
  }
  return normalized;
}

export function validateTermQuery(term: unknown): string | undefined {
  if (term === undefined || term === null) return undefined;
  if (typeof term !== 'string') {
    throw new Error(`term must be a string, got ${typeof term}`);
  }
  if (term.trim().length === 0) {
    throw new Error('term must not be empty');
  }
  if (term.length > 200) {
    throw new Error('term too long (max 200 characters)');
  }
  return term.trim();
}

export function validateTableIndex(index: unknown): number | undefined {
  if (index === undefined || index === null) return undefined;
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) {
    throw new Error(`table_index must be a non-negative integer, got ${index}`);
  }
  return index;
}
