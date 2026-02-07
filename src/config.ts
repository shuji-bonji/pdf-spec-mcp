/**
 * Application Configuration
 */

import { createRequire } from 'module';
import type { SpecCategory } from './types/index.js';

const require = createRequire(import.meta.url);
const packageJson = require('../package.json') as { name: string; version: string };

export const PACKAGE_INFO = {
  name: packageJson.name,
  version: packageJson.version,
} as const;

export const PDF_CONFIG = {
  envVar: 'PDF_SPEC_DIR',
  primaryPdf: 'ISO_32000-2_sponsored-ec2.pdf',
} as const;

export const CACHE_CONFIG = {
  sectionContent: { maxSize: 50, name: 'SectionContentCache' },
} as const;

/** Maximum number of PDFDocumentProxy instances cached simultaneously */
export const MAX_CACHED_DOCS = 4;

/** Default spec ID when `spec` parameter is omitted */
export const DEFAULT_SPEC_ID = 'iso32000-2';

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
 * The first match wins when scanning PDF_SPEC_DIR.
 * Primary spec (default) must be first.
 */
export const SPEC_PATTERNS: SpecPattern[] = [
  // Primary: ISO 32000-2 EC2 (must be first — default spec)
  {
    pattern: /ISO_32000-2_sponsored-ec2\.pdf$/i,
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
