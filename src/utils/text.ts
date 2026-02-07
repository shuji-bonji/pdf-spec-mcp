/**
 * Text Utilities
 * Common text processing functions used across services.
 */

/**
 * Remove zero-width and invisible Unicode characters from text.
 * PDF text extraction frequently includes these artifacts.
 */
export function stripZeroWidthChars(text: string): string {
  return text.replace(/[\u200B-\u200F\u2028-\u202F\uFEFF]/g, '');
}

/**
 * Normalize a section/heading title for comparison.
 * Strips invisible chars, lowercases, and collapses whitespace.
 */
export function normalizeTitle(title: string): string {
  return stripZeroWidthChars(title).toLowerCase().replace(/\s+/g, ' ').trim();
}
