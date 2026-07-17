/**
 * Application Configuration
 */

import { createRequire } from 'node:module';
import type { SpecCategory } from './types/index.js';

const require = createRequire(import.meta.url);
const packageJson = require('../package.json') as { name: string; version: string };

export const PACKAGE_INFO = {
  name: packageJson.name,
  version: packageJson.version,
} as const;

export const PDF_CONFIG = {
  envVar: 'PDF_SPEC_DIR',
  primaryPdf: 'ISO_32000-2_sponsored_EC3.pdf',
} as const;

export const CACHE_CONFIG = {
  sectionContent: { maxSize: 50, name: 'SectionContentCache' },
} as const;

/** Maximum number of PDFDocumentProxy instances cached simultaneously */
export const MAX_CACHED_DOCS = 4;

/** Default spec ID when `spec` parameter is omitted */
export const DEFAULT_SPEC_ID = 'iso32000-2';

/** Validation limits (extracted from magic numbers in validation.ts) */
export const VALIDATION_LIMITS = {
  queryMaxLength: 500,
  termMaxLength: 200,
  specIdMaxLength: 50,
  maxDepthRange: { min: 1, max: 10 } as const,
  maxResultsRange: { min: 1, max: 50 } as const,
  defaultMaxResults: 10,
} as const;

/**
 * How many pages past a section's last page to follow a table continuation.
 *
 * Section ranges end at `nextSection.page - 1`, so a continuation normally occupies
 * exactly one page (`endPage + 1`) before the next heading appears. The allowance
 * exists only for tables long enough to fill whole pages with no heading in sight;
 * it caps the damage if the outline's page numbers are wrong.
 */
export const MAX_TABLE_CONTINUATION_PAGES = 5;

/** Matches a table caption paragraph ("Table 182 — Additional entries...") */
export const TABLE_CAPTION_START_RE = /^Table\s+\d+/;

/** Concurrency limits for chunked parallel processing */
export const CONCURRENCY = {
  /** Pages processed in parallel during search index build */
  searchIndex: 20,
  /** Sections processed in parallel during requirements index build */
  requirementsIndex: 10,
  /** Pages processed in parallel during content extraction */
  contentExtraction: 10,
} as const;

/** Filename pattern → spec ID mapping rule */
export interface SpecPattern {
  pattern: RegExp;
  id: string;
  title: string;
  category: SpecCategory;
  description: string;
}

/**
 * Ordered list of filename patterns for auto-discovery.
 * Array order = priority: when multiple files map to the same spec ID,
 * the file matching the earlier pattern wins (see discoverSpecs).
 * Primary spec (default) must be first.
 */
export const SPEC_PATTERNS: SpecPattern[] = [
  // Primary: ISO 32000-2 EC3 (must be first — default spec)
  {
    pattern: /ISO_32000-2_sponsored[-_]ec3\.pdf$/i,
    id: 'iso32000-2',
    title: 'ISO 32000-2:2020 (PDF 2.0) with Errata Collection 3',
    category: 'standard',
    description: 'The current PDF 2.0 specification with errata corrections',
  },
  // Fallback: ISO 32000-2 EC2 (same ID — used only when no EC3 file exists)
  {
    pattern: /ISO_32000-2_sponsored[-_]ec2\.pdf$/i,
    id: 'iso32000-2',
    title: 'ISO 32000-2:2020 (PDF 2.0) with Errata Collection 2',
    category: 'standard',
    description: 'The current PDF 2.0 specification with errata corrections',
  },
  // ISO 32000-2 original (no errata)
  {
    pattern: /ISO_32000-2-2020_sponsored\.pdf$/i,
    id: 'iso32000-2-2020',
    title: 'ISO 32000-2:2020 (PDF 2.0) original',
    category: 'standard',
    description: 'Original PDF 2.0 specification without errata',
  },
  // PDF 1.7 (ISO 32000-1)
  {
    pattern: /PDF32000_2008\.pdf$/i,
    id: 'pdf17',
    title: 'ISO 32000-1:2008 (PDF 1.7)',
    category: 'standard',
    description: 'The PDF 1.7 specification (first ISO-standardized version)',
  },
  // Adobe PDF Reference 1.7
  {
    pattern: /pdfreference1\.7old\.pdf$/i,
    id: 'pdf17old',
    title: 'PDF Reference 1.7 (Adobe)',
    category: 'standard',
    description: 'Adobe PDF Reference, version 1.7 (pre-ISO)',
  },
  // TS documents
  {
    pattern: /ISO_TS_32001.*\.pdf$/i,
    id: 'ts32001',
    title: 'ISO/TS 32001:2022',
    category: 'ts',
    description: 'Extensions to Hash Algorithms in ISO 32000-2 (SHA-3)',
  },
  {
    pattern: /ISO_TS_32002.*\.pdf$/i,
    id: 'ts32002',
    title: 'ISO/TS 32002:2022',
    category: 'ts',
    description: 'Extensions to Digital Signatures in ISO 32000-2 (ECC/PAdES)',
  },
  {
    pattern: /ISO_TS_32003.*\.pdf$/i,
    id: 'ts32003',
    title: 'ISO/TS 32003:2023',
    category: 'ts',
    description: 'Adding support of AES-GCM in PDF 2.0',
  },
  {
    pattern: /ISO[-_]TS[-_]32004.*\.pdf$/i,
    id: 'ts32004',
    title: 'ISO/TS 32004:2024',
    category: 'ts',
    description: 'Integrity protection in encrypted documents in PDF 2.0',
  },
  {
    pattern: /ISO[-_]TS[-_]32005.*\.pdf$/i,
    id: 'ts32005',
    title: 'ISO/TS 32005:2023',
    category: 'ts',
    description: 'PDF 1.7 and 2.0 structure namespace mapping',
  },
  // PDF/UA
  {
    pattern: /ISO[-_]14289[-_]1.*\.pdf$/i,
    id: 'pdfua1',
    title: 'ISO 14289-1:2014 (PDF/UA-1)',
    category: 'pdfua',
    description: 'PDF/UA-1: Accessibility using ISO 32000-1',
  },
  {
    pattern: /ISO[-_]14289[-_]2.*\.pdf$/i,
    id: 'pdfua2',
    title: 'ISO 14289-2:2024 (PDF/UA-2)',
    category: 'pdfua',
    description: 'PDF/UA-2: Accessibility using ISO 32000-2',
  },
  // PDF Association guides
  {
    pattern: /Tagged-PDF-Best-Practice/i,
    id: 'tagged-bpg',
    title: 'Tagged PDF Best Practice Guide: Syntax 1.0.1',
    category: 'guide',
    description: 'PDF Association guide for tagged PDF syntax',
  },
  {
    pattern: /Well-Tagged-PDF-WTPDF/i,
    id: 'wtpdf',
    title: 'Well-Tagged PDF (WTPDF) 1.0',
    category: 'guide',
    description: 'Using Tagged PDF for Accessibility and Reuse in PDF 2.0',
  },
  {
    pattern: /PDF-Declarations\.pdf$/i,
    id: 'declarations',
    title: 'PDF Declarations',
    category: 'guide',
    description: 'PDF Association specification for PDF Declarations',
  },
  // Application Notes
  {
    pattern: /PDF20_AN001/i,
    id: 'an001',
    title: 'PDF 2.0 Application Note 001',
    category: 'appnote',
    description: 'Black Point Compensation',
  },
  {
    pattern: /PDF20_AN002/i,
    id: 'an002',
    title: 'PDF 2.0 Application Note 002',
    category: 'appnote',
    description: 'Associated Files',
  },
  {
    pattern: /PDF20_AN003/i,
    id: 'an003',
    title: 'PDF 2.0 Application Note 003',
    category: 'appnote',
    description: 'Object Metadata Locations',
  },
];
