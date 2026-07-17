/**
 * validation.ts unit tests
 *
 * Rewritten for A-4: the hand-written `validateXxx` asserts were replaced by Zod schemas,
 * so these exercise the schemas through `parseArgs` — the same path the handlers take.
 *
 * The limits and the rejections they enforce are unchanged from the hand-written
 * validators; this file is what pins that, since the constraints now live in a schema that
 * is also published to clients.
 */

import { describe, expect, it } from 'vitest';
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
} from './validation.js';

describe('parseArgs', () => {
  it('returns the parsed value on success', () => {
    expect(parseArgs(GetSectionSchema, { section: '7.3.4' })).toEqual({ section: '7.3.4' });
  });

  it('reports the offending field, not just that something was wrong', () => {
    expect(() => parseArgs(GetSectionSchema, { section: 123 })).toThrow(/section/);
  });

  it('raises a ValidationError so it reaches the client as VALIDATION_ERROR', () => {
    try {
      parseArgs(GetSectionSchema, {});
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as { code?: string }).code).toBe('VALIDATION_ERROR');
      expect((e as { retryable?: boolean }).retryable).toBe(true);
    }
  });
});

describe('section argument', () => {
  it('accepts section numbers and annex names', () => {
    for (const section of ['7.3.4', 'Annex A', '12.8.1']) {
      expect(parseArgs(GetSectionSchema, { section }).section).toBe(section);
    }
  });

  it('rejects a missing or non-string section', () => {
    expect(() => parseArgs(GetSectionSchema, {})).toThrow();
    expect(() => parseArgs(GetSectionSchema, { section: 123 })).toThrow();
  });

  it('rejects an empty or whitespace-only section', () => {
    // Whitespace matters: `min(1)` alone would accept "   ".
    expect(() => parseArgs(GetSectionSchema, { section: '' })).toThrow('must not be empty');
    expect(() => parseArgs(GetSectionSchema, { section: '   ' })).toThrow('must not be empty');
  });

  it('applies the same rule where section is optional', () => {
    // get_requirements and compare_versions take an optional section — optional must not
    // mean unchecked.
    expect(parseArgs(GetRequirementsSchema, {}).section).toBeUndefined();
    expect(() => parseArgs(GetRequirementsSchema, { section: '   ' })).toThrow('must not be empty');
    expect(parseArgs(CompareVersionsSchema, {}).section).toBeUndefined();
    expect(() => parseArgs(CompareVersionsSchema, { section: '   ' })).toThrow('must not be empty');
  });
});

describe('search_spec query', () => {
  it('accepts a normal query', () => {
    expect(parseArgs(SearchSpecSchema, { query: 'digital signature' }).query).toBe(
      'digital signature',
    );
  });

  it('rejects a missing, empty or whitespace-only query', () => {
    expect(() => parseArgs(SearchSpecSchema, {})).toThrow();
    expect(() => parseArgs(SearchSpecSchema, { query: '' })).toThrow('must not be empty');
    expect(() => parseArgs(SearchSpecSchema, { query: '  ' })).toThrow('must not be empty');
  });

  it('accepts exactly 500 characters and rejects 501', () => {
    expect(() => parseArgs(SearchSpecSchema, { query: 'a'.repeat(500) })).not.toThrow();
    expect(() => parseArgs(SearchSpecSchema, { query: 'a'.repeat(501) })).toThrow('too long');
  });
});

describe('max_depth', () => {
  it('is optional', () => {
    expect(parseArgs(GetStructureSchema, {}).max_depth).toBeUndefined();
  });

  it('accepts 1 to 10', () => {
    for (const d of [1, 5, 10]) {
      expect(parseArgs(GetStructureSchema, { max_depth: d }).max_depth).toBe(d);
    }
  });

  it('rejects out-of-range, non-integer and non-number values', () => {
    expect(() => parseArgs(GetStructureSchema, { max_depth: 0 })).toThrow();
    expect(() => parseArgs(GetStructureSchema, { max_depth: 11 })).toThrow();
    expect(() => parseArgs(GetStructureSchema, { max_depth: 2.5 })).toThrow();
    expect(() => parseArgs(GetStructureSchema, { max_depth: '5' })).toThrow();
  });
});

describe('max_results', () => {
  it('defaults to 10 when omitted', () => {
    expect(resolveMaxResults(parseArgs(SearchSpecSchema, { query: 'x' }).max_results)).toBe(10);
  });

  it('accepts 1 to 50, and passes the value through', () => {
    for (const n of [1, 25, 50]) {
      const parsed = parseArgs(SearchSpecSchema, { query: 'x', max_results: n });
      expect(parsed.max_results).toBe(n);
      expect(resolveMaxResults(parsed.max_results)).toBe(n);
    }
  });

  it('rejects out-of-range and non-integer values', () => {
    expect(() => parseArgs(SearchSpecSchema, { query: 'x', max_results: 0 })).toThrow();
    expect(() => parseArgs(SearchSpecSchema, { query: 'x', max_results: 51 })).toThrow();
    expect(() => parseArgs(SearchSpecSchema, { query: 'x', max_results: 1.5 })).toThrow();
  });
});

describe('normalizeRequirementLevel', () => {
  it('returns undefined when omitted', () => {
    expect(normalizeRequirementLevel(undefined)).toBeUndefined();
  });

  it('accepts the five ISO levels', () => {
    for (const level of ['shall', 'shall not', 'should', 'should not', 'may']) {
      expect(normalizeRequirementLevel(level)).toBe(level);
    }
  });

  it('forgives case and surrounding whitespace', () => {
    // Deliberately left out of the Zod enum so callers can keep passing "SHALL".
    expect(normalizeRequirementLevel('SHALL')).toBe('shall');
    expect(normalizeRequirementLevel('SHALL NOT')).toBe('shall not');
    expect(normalizeRequirementLevel('May')).toBe('may');
    expect(normalizeRequirementLevel('  shall  ')).toBe('shall');
  });

  it('rejects anything else', () => {
    expect(() => normalizeRequirementLevel('must')).toThrow('Invalid requirement level');
    expect(() => normalizeRequirementLevel('invalid')).toThrow('Invalid requirement level');
  });
});

describe('get_definitions term', () => {
  it('is optional', () => {
    expect(parseArgs(GetDefinitionsSchema, {}).term).toBeUndefined();
    expect(normalizeTerm(undefined)).toBeUndefined();
  });

  it('is trimmed before use', () => {
    expect(normalizeTerm(parseArgs(GetDefinitionsSchema, { term: '  glyph  ' }).term)).toBe(
      'glyph',
    );
  });

  it('rejects empty, whitespace-only, over-long and non-string terms', () => {
    expect(() => parseArgs(GetDefinitionsSchema, { term: '' })).toThrow('must not be empty');
    expect(() => parseArgs(GetDefinitionsSchema, { term: '   ' })).toThrow('must not be empty');
    expect(() => parseArgs(GetDefinitionsSchema, { term: 'a'.repeat(201) })).toThrow('too long');
    expect(() => parseArgs(GetDefinitionsSchema, { term: 42 })).toThrow();
  });
});

describe('table_index', () => {
  it('is optional', () => {
    expect(parseArgs(GetTablesSchema, { section: '1' }).table_index).toBeUndefined();
  });

  it('accepts non-negative integers', () => {
    expect(parseArgs(GetTablesSchema, { section: '1', table_index: 0 }).table_index).toBe(0);
    expect(parseArgs(GetTablesSchema, { section: '1', table_index: 5 }).table_index).toBe(5);
  });

  it('rejects negative, non-integer and non-number values', () => {
    expect(() => parseArgs(GetTablesSchema, { section: '1', table_index: -1 })).toThrow();
    expect(() => parseArgs(GetTablesSchema, { section: '1', table_index: 1.5 })).toThrow();
    expect(() => parseArgs(GetTablesSchema, { section: '1', table_index: '0' })).toThrow();
  });
});

describe('spec', () => {
  it('is optional — omitted means the default spec', () => {
    expect(parseArgs(GetStructureSchema, {}).spec).toBeUndefined();
  });

  it('accepts known spec ids', () => {
    for (const spec of ['iso32000-2', 'ts32002']) {
      expect(parseArgs(GetStructureSchema, { spec }).spec).toBe(spec);
    }
  });

  it('accepts exactly 50 characters and rejects 51', () => {
    const exact = 'a'.repeat(50);
    expect(parseArgs(GetStructureSchema, { spec: exact }).spec).toBe(exact);
    expect(() => parseArgs(GetStructureSchema, { spec: 'a'.repeat(51) })).toThrow(
      '50 characters or less',
    );
  });

  it('rejects an empty or non-string spec', () => {
    expect(() => parseArgs(GetStructureSchema, { spec: '' })).toThrow('non-empty');
    expect(() => parseArgs(GetStructureSchema, { spec: 123 })).toThrow();
  });
});

describe('list_specs category', () => {
  it('is optional and free-form (an unknown category filters to nothing)', () => {
    expect(parseArgs(ListSpecsSchema, {}).category).toBeUndefined();
    expect(parseArgs(ListSpecsSchema, { category: 'ts' }).category).toBe('ts');
    expect(parseArgs(ListSpecsSchema, { category: 'nonexistent' }).category).toBe('nonexistent');
  });
});
