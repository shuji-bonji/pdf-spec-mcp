import { describe, it, expect } from 'vitest';
import {
  validateSectionId,
  validateSearchQuery,
  validateMaxDepth,
  validateMaxResults,
} from './validation.js';

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
