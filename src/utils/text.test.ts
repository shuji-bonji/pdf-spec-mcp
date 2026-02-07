/**
 * text.ts unit tests
 * Tests for text processing utilities: stripZeroWidthChars and normalizeTitle
 */

import { describe, it, expect } from 'vitest';
import { stripZeroWidthChars, normalizeTitle } from './text.js';

// ========================================
// stripZeroWidthChars Tests
// ========================================

describe('stripZeroWidthChars', () => {
  it('returns normal text unchanged', () => {
    expect(stripZeroWidthChars('Hello World')).toBe('Hello World');
    expect(stripZeroWidthChars('7.3.4 Types of function')).toBe('7.3.4 Types of function');
  });

  it('removes U+200B (zero-width space)', () => {
    expect(stripZeroWidthChars('Hello\u200BWorld')).toBe('HelloWorld');
    expect(stripZeroWidthChars('\u200BStart')).toBe('Start');
    expect(stripZeroWidthChars('End\u200B')).toBe('End');
  });

  it('removes U+200F (right-to-left mark)', () => {
    expect(stripZeroWidthChars('Hello\u200FWorld')).toBe('HelloWorld');
    expect(stripZeroWidthChars('\u200FText')).toBe('Text');
  });

  it('removes U+FEFF (BOM - byte order mark)', () => {
    expect(stripZeroWidthChars('Hello\uFEFFWorld')).toBe('HelloWorld');
    expect(stripZeroWidthChars('\uFEFFStart of text')).toBe('Start of text');
  });

  it('removes U+2028 (line separator)', () => {
    expect(stripZeroWidthChars('Line1\u2028Line2')).toBe('Line1Line2');
    expect(stripZeroWidthChars('\u2028Line')).toBe('Line');
  });

  it('removes multiple types of invisible characters mixed together', () => {
    expect(stripZeroWidthChars('7.3.4\u200B Types\u200F of\u2028 function\uFEFF')).toBe(
      '7.3.4 Types of function'
    );
    expect(stripZeroWidthChars('A\u200BB\u200FC\uFEFFD\u2028E')).toBe('ABCDE');
  });

  it('handles other zero-width and invisible Unicode characters in the range', () => {
    // U+200C (zero-width non-joiner) and U+200D (zero-width joiner) are in the range
    expect(stripZeroWidthChars('Hello\u200CWorld')).toBe('HelloWorld');
    expect(stripZeroWidthChars('Hello\u200DWorld')).toBe('HelloWorld');
    // U+200E (left-to-right mark)
    expect(stripZeroWidthChars('Hello\u200EWorld')).toBe('HelloWorld');
    // U+202F (narrow no-break space)
    expect(stripZeroWidthChars('Hello\u202FWorld')).toBe('HelloWorld');
  });

  it('returns empty string unchanged', () => {
    expect(stripZeroWidthChars('')).toBe('');
  });

  it('handles string with only invisible characters', () => {
    expect(stripZeroWidthChars('\u200B\u200F\u2028\uFEFF')).toBe('');
  });

  it('handles long strings with many invisible characters', () => {
    const input = 'The\u200Bquick\u200Fbrown\u2028fox\uFEFFjumps';
    expect(stripZeroWidthChars(input)).toBe('Thequickbrownfoxjumps');
  });
});

// ========================================
// normalizeTitle Tests
// ========================================

describe('normalizeTitle', () => {
  it('converts uppercase to lowercase', () => {
    expect(normalizeTitle('HELLO')).toBe('hello');
    expect(normalizeTitle('Hello World')).toBe('hello world');
    expect(normalizeTitle('TYPE OF FUNCTION')).toBe('type of function');
  });

  it('collapses multiple whitespace into single space', () => {
    expect(normalizeTitle('Hello    World')).toBe('hello world');
    expect(normalizeTitle('Multiple  \t  spaces')).toBe('multiple spaces');
    expect(normalizeTitle('Tabs\t\tand\nspaces')).toBe('tabs and spaces');
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalizeTitle('  Hello World  ')).toBe('hello world');
    expect(normalizeTitle('\n\tText\n\t')).toBe('text');
    expect(normalizeTitle('   SPACED   ')).toBe('spaced');
  });

  it('removes zero-width characters and then normalizes', () => {
    expect(normalizeTitle('7.3.4\u200B Types\u200F of\u2028 function\uFEFF')).toBe(
      '7.3.4 types of function'
    );
    expect(normalizeTitle('Hello\u200BWorld\u200F')).toBe('helloworld');
  });

  it('handles empty string', () => {
    expect(normalizeTitle('')).toBe('');
  });

  it('handles string with only whitespace and invisible characters', () => {
    expect(normalizeTitle('   \u200B   ')).toBe('');
    expect(normalizeTitle('\u200F\u2028\uFEFF')).toBe('');
  });

  it('handles PDF extraction pattern with multiple invisible characters', () => {
    // Common PDF extraction pattern: section number with embedded zero-width spaces
    const pdfPattern = '7.3.4\u200B Types\u200B of\u200B function';
    expect(normalizeTitle(pdfPattern)).toBe('7.3.4 types of function');
  });

  it('normalizes mixed case with extra whitespace', () => {
    expect(normalizeTitle('  NORMAL  TITLE  ')).toBe('normal title');
    expect(normalizeTitle('MiXeD\t\tCaSe\n\nTiTlE')).toBe('mixed case title');
  });

  it('handles single character', () => {
    expect(normalizeTitle('A')).toBe('a');
    expect(normalizeTitle(' X ')).toBe('x');
  });

  it('preserves special characters that are not whitespace or invisible', () => {
    expect(normalizeTitle('Hello-World')).toBe('hello-world');
    expect(normalizeTitle('Type.Name')).toBe('type.name');
    expect(normalizeTitle('Item#1')).toBe('item#1');
  });

  it('handles complex real-world PDF title cases', () => {
    expect(normalizeTitle('  7.3.4  TYPES  OF  FUNCTION  ')).toBe('7.3.4 types of function');
    // Zero-width spaces are removed entirely, not converted to regular spaces
    expect(normalizeTitle('Introduction\u200BTo\u200BPDF')).toBe('introductiontopdf');
    expect(normalizeTitle('  Document\u200B  Properties\u200F  ')).toBe('document properties');
  });
});
