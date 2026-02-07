/**
 * validation.ts unit tests
 * Phase 1-2 validators + Phase 3 additions (validateSpecId, validateCompareSection)
 */

import { describe, it, expect } from 'vitest';
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
} from './validation.js';

// ========================================
// Phase 1-2: Existing validators
// ========================================

describe('validateSectionId', () => {
  it('accepts valid section strings', () => {
    expect(() => validateSectionId('7.3.4')).not.toThrow();
    expect(() => validateSectionId('Annex A')).not.toThrow();
    expect(() => validateSectionId('12.8.1')).not.toThrow();
    expect(() => validateSectionId('Foreword')).not.toThrow();
  });

  it('rejects non-string values', () => {
    expect(() => validateSectionId(123)).toThrow('Section must be a string');
    expect(() => validateSectionId(null)).toThrow('Section must be a string');
    expect(() => validateSectionId(undefined)).toThrow('Section must be a string');
  });

  it('rejects empty strings', () => {
    expect(() => validateSectionId('')).toThrow('must not be empty');
    expect(() => validateSectionId('   ')).toThrow('must not be empty');
  });
});

describe('validateSearchQuery', () => {
  it('accepts valid queries', () => {
    expect(() => validateSearchQuery('digital signature')).not.toThrow();
    expect(() => validateSearchQuery('CMS')).not.toThrow();
  });

  it('rejects non-string values', () => {
    expect(() => validateSearchQuery(42)).toThrow('Query must be a string');
    expect(() => validateSearchQuery(null)).toThrow('Query must be a string');
  });

  it('rejects empty queries', () => {
    expect(() => validateSearchQuery('')).toThrow('must not be empty');
    expect(() => validateSearchQuery('  ')).toThrow('must not be empty');
  });

  it('rejects queries exceeding 500 characters', () => {
    const longQuery = 'a'.repeat(501);
    expect(() => validateSearchQuery(longQuery)).toThrow('too long');
  });

  it('accepts queries at exactly 500 characters', () => {
    const maxQuery = 'a'.repeat(500);
    expect(() => validateSearchQuery(maxQuery)).not.toThrow();
  });
});

describe('validateMaxDepth', () => {
  it('returns undefined for null/undefined', () => {
    expect(validateMaxDepth(undefined)).toBeUndefined();
    expect(validateMaxDepth(null)).toBeUndefined();
  });

  it('accepts valid integers 1-10', () => {
    expect(validateMaxDepth(1)).toBe(1);
    expect(validateMaxDepth(5)).toBe(5);
    expect(validateMaxDepth(10)).toBe(10);
  });

  it('rejects out-of-range values', () => {
    expect(() => validateMaxDepth(0)).toThrow();
    expect(() => validateMaxDepth(11)).toThrow();
    expect(() => validateMaxDepth(-1)).toThrow();
  });

  it('rejects non-integer numbers', () => {
    expect(() => validateMaxDepth(1.5)).toThrow();
    expect(() => validateMaxDepth(3.14)).toThrow();
  });

  it('rejects non-number types', () => {
    expect(() => validateMaxDepth('3')).toThrow();
  });
});

describe('validateMaxResults', () => {
  it('returns 10 for null/undefined (default)', () => {
    expect(validateMaxResults(undefined)).toBe(10);
    expect(validateMaxResults(null)).toBe(10);
  });

  it('accepts valid integers 1-50', () => {
    expect(validateMaxResults(1)).toBe(1);
    expect(validateMaxResults(25)).toBe(25);
    expect(validateMaxResults(50)).toBe(50);
  });

  it('rejects out-of-range values', () => {
    expect(() => validateMaxResults(0)).toThrow();
    expect(() => validateMaxResults(51)).toThrow();
    expect(() => validateMaxResults(-1)).toThrow();
  });

  it('rejects non-integer numbers', () => {
    expect(() => validateMaxResults(2.5)).toThrow();
  });
});

describe('validateRequirementLevel', () => {
  it('returns undefined for null/undefined', () => {
    expect(validateRequirementLevel(undefined)).toBeUndefined();
    expect(validateRequirementLevel(null)).toBeUndefined();
  });

  it('accepts valid lowercase levels', () => {
    expect(validateRequirementLevel('shall')).toBe('shall');
    expect(validateRequirementLevel('shall not')).toBe('shall not');
    expect(validateRequirementLevel('should')).toBe('should');
    expect(validateRequirementLevel('should not')).toBe('should not');
    expect(validateRequirementLevel('may')).toBe('may');
  });

  it('normalizes uppercase to lowercase', () => {
    expect(validateRequirementLevel('SHALL')).toBe('shall');
    expect(validateRequirementLevel('SHALL NOT')).toBe('shall not');
    expect(validateRequirementLevel('May')).toBe('may');
  });

  it('rejects invalid levels', () => {
    expect(() => validateRequirementLevel('must')).toThrow('Invalid requirement level');
    expect(() => validateRequirementLevel('invalid')).toThrow('Invalid requirement level');
  });

  it('rejects non-string types', () => {
    expect(() => validateRequirementLevel(123)).toThrow('level must be a string');
  });
});

describe('validateTermQuery', () => {
  it('returns undefined for null/undefined', () => {
    expect(validateTermQuery(undefined)).toBeUndefined();
    expect(validateTermQuery(null)).toBeUndefined();
  });

  it('accepts valid term strings', () => {
    expect(validateTermQuery('font')).toBe('font');
    expect(validateTermQuery('  glyph  ')).toBe('glyph');
  });

  it('rejects empty strings', () => {
    expect(() => validateTermQuery('')).toThrow('must not be empty');
    expect(() => validateTermQuery('   ')).toThrow('must not be empty');
  });

  it('rejects terms exceeding 200 characters', () => {
    expect(() => validateTermQuery('a'.repeat(201))).toThrow('too long');
  });

  it('rejects non-string types', () => {
    expect(() => validateTermQuery(42)).toThrow('term must be a string');
  });
});

describe('validateTableIndex', () => {
  it('returns undefined for null/undefined', () => {
    expect(validateTableIndex(undefined)).toBeUndefined();
    expect(validateTableIndex(null)).toBeUndefined();
  });

  it('accepts valid non-negative integers', () => {
    expect(validateTableIndex(0)).toBe(0);
    expect(validateTableIndex(5)).toBe(5);
  });

  it('rejects negative numbers', () => {
    expect(() => validateTableIndex(-1)).toThrow('non-negative integer');
  });

  it('rejects non-integer numbers', () => {
    expect(() => validateTableIndex(1.5)).toThrow('non-negative integer');
  });

  it('rejects non-number types', () => {
    expect(() => validateTableIndex('0')).toThrow('non-negative integer');
  });
});

// ========================================
// Phase 3: validateSpecId
// ========================================

describe('validateSpecId', () => {
  it('returns undefined for undefined input', () => {
    expect(validateSpecId(undefined)).toBeUndefined();
  });

  it('returns undefined for null input', () => {
    expect(validateSpecId(null)).toBeUndefined();
  });

  it('accepts valid spec ID: "iso32000-2"', () => {
    expect(validateSpecId('iso32000-2')).toBe('iso32000-2');
  });

  it('accepts valid spec ID: "ts32002"', () => {
    expect(validateSpecId('ts32002')).toBe('ts32002');
  });

  it('rejects empty string', () => {
    expect(() => validateSpecId('')).toThrow('spec must be a non-empty string');
  });

  it('rejects non-string types', () => {
    expect(() => validateSpecId(123)).toThrow('spec must be a non-empty string');
  });

  it('rejects strings exceeding 50 characters', () => {
    const long = 'a'.repeat(51);
    expect(() => validateSpecId(long)).toThrow('spec must be 50 characters or less');
  });

  it('accepts strings of exactly 50 characters', () => {
    const exact = 'a'.repeat(50);
    expect(validateSpecId(exact)).toBe(exact);
  });
});

// ========================================
// Phase 3: validateCompareSection
// ========================================

describe('validateCompareSection', () => {
  it('returns undefined for undefined input', () => {
    expect(validateCompareSection(undefined)).toBeUndefined();
  });

  it('returns undefined for null input', () => {
    expect(validateCompareSection(null)).toBeUndefined();
  });

  it('accepts valid section "12.8"', () => {
    expect(validateCompareSection('12.8')).toBe('12.8');
  });

  it('delegates to validateSectionId — rejects empty string', () => {
    expect(() => validateCompareSection('')).toThrow('Section must not be empty');
  });
});
