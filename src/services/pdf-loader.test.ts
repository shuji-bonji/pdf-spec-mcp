/**
 * pdf-loader.ts unit tests
 * Tests parseSectionNumber() for various PDF spec formats.
 */

import { describe, it, expect } from 'vitest';
import { parseSectionNumber } from './pdf-loader.js';

describe('parseSectionNumber', () => {
  describe('standard numeric sections', () => {
    it('should parse single-level section: "7 Syntax"', () => {
      expect(parseSectionNumber('7 Syntax')).toBe('7');
    });

    it('should parse two-level section: "7.3 Objects"', () => {
      expect(parseSectionNumber('7.3 Objects')).toBe('7.3');
    });

    it('should parse deep section: "7.3.4.1 Name objects"', () => {
      expect(parseSectionNumber('7.3.4.1 Name objects')).toBe('7.3.4.1');
    });

    it('should parse section with tab separator: "7.3.4\tString objects"', () => {
      expect(parseSectionNumber('7.3.4\tString objects')).toBe('7.3.4');
    });
  });

  describe('dot-terminated numeric (WTPDF format)', () => {
    it('should parse "1. Introduction" → "1"', () => {
      expect(parseSectionNumber('1. Introduction')).toBe('1');
    });

    it('should parse "5. Notation & Terminology" → "5"', () => {
      expect(parseSectionNumber('5. Notation & Terminology')).toBe('5');
    });

    it('should NOT match standard subsection "4.1 artifact" (no trailing dot)', () => {
      expect(parseSectionNumber('4.1 artifact marked content sequence')).toBe('4.1');
    });
  });

  describe('Annex sections', () => {
    it('should parse "Annex A (normative) Operator summary"', () => {
      expect(parseSectionNumber('Annex A (normative) Operator summary')).toBe('Annex A');
    });

    it('should parse "Annex A" alone', () => {
      expect(parseSectionNumber('Annex A ')).toBe('Annex A');
    });

    it('should parse Annex subsection: "Annex A.1 Description"', () => {
      expect(parseSectionNumber('Annex A.1 Description')).toBe('Annex A.1');
    });
  });

  describe('Appendix sections (WTPDF/PDF Association)', () => {
    it('should parse "Appendix A: Example PDF Declaration"', () => {
      expect(parseSectionNumber('Appendix A: Example PDF Declaration')).toBe('Appendix A');
    });

    it('should normalize case: "appendix B" → "Appendix B"', () => {
      expect(parseSectionNumber('appendix B something')).toBe('Appendix B');
    });
  });

  describe('zero-width space handling', () => {
    it('should strip zero-width spaces: "1 \\u200BScope "', () => {
      expect(parseSectionNumber('1 \u200BScope ')).toBe('1');
    });

    it('should strip FEFF BOM: "\\uFEFF7.3 Objects"', () => {
      expect(parseSectionNumber('\uFEFF7.3 Objects')).toBe('7.3');
    });
  });

  describe('non-matching titles', () => {
    it('should return null for "Foreword"', () => {
      expect(parseSectionNumber('Foreword')).toBeNull();
    });

    it('should return null for "Introduction"', () => {
      expect(parseSectionNumber('Introduction')).toBeNull();
    });

    it('should return null for "Bibliography"', () => {
      expect(parseSectionNumber('Bibliography')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(parseSectionNumber('')).toBeNull();
    });
  });
});
