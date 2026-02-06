/**
 * Input Validation Utilities
 */

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
