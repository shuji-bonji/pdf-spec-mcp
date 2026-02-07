/**
 * PDF Service
 * Orchestration layer with caching for all PDF operations
 */

import { existsSync } from 'fs';
import { join } from 'path';
import { PDF_CONFIG, CACHE_CONFIG } from '../config.js';
import { LRUCache } from '../utils/cache.js';
import { logger } from '../utils/logger.js';
import { loadDocument, getOutlineWithPages } from './pdf-loader.js';
import { buildSectionIndex, findSection } from './outline-resolver.js';
import { extractSectionContent } from './content-extractor.js';
import { buildSearchIndex, searchTextIndex } from './search-index.js';
import { extractRequirementsFromContent } from './requirement-extractor.js';
import { extractAllDefinitions } from './definition-extractor.js';
import type {
  SectionIndex,
  TextIndex,
  SectionResult,
  SearchHit,
  ContentElement,
  Requirement,
  RequirementsResult,
  ISORequirementLevel,
  Definition,
  DefinitionsResult,
  TablesResult,
  TableInfo,
} from '../types/index.js';

// Cached state (singleton per server lifetime)
let sectionIndexPromise: Promise<SectionIndex> | null = null;
let searchIndexPromise: Promise<TextIndex> | null = null;
let requirementsIndexPromise: Promise<Requirement[]> | null = null;
let definitionsPromise: Promise<Definition[]> | null = null;

// Section content cache
const sectionContentCache = new LRUCache<string, ContentElement[]>(CACHE_CONFIG.sectionContent);

/**
 * Resolve PDF path from environment variable
 */
function getPdfPath(): string {
  const dir = process.env[PDF_CONFIG.envVar];
  if (!dir) {
    throw new Error(
      `Environment variable ${PDF_CONFIG.envVar} is not set. ` +
        `Set it to the directory containing PDF specification files.`
    );
  }
  const pdfPath = join(dir, PDF_CONFIG.primaryPdf);
  if (!existsSync(pdfPath)) {
    throw new Error(
      `PDF file not found: ${pdfPath}. ` +
        `Download it from https://pdfa.org/resource/iso-32000-pdf/`
    );
  }
  return pdfPath;
}

/**
 * Get section index (lazy initialization, cached)
 */
export async function getSectionIndex(): Promise<SectionIndex> {
  if (!sectionIndexPromise) {
    sectionIndexPromise = initSectionIndex();
  }
  return sectionIndexPromise;
}

async function initSectionIndex(): Promise<SectionIndex> {
  const pdfPath = getPdfPath();
  const doc = await loadDocument(pdfPath);
  const outline = await getOutlineWithPages(doc);
  const index = buildSectionIndex(outline, doc.numPages);
  logger.info(
    'PDFService',
    `Section index built: ${index.sections.size} sections, ${doc.numPages} pages`
  );
  return index;
}

/**
 * Get section content by section identifier
 */
export async function getSectionContent(sectionId: string): Promise<SectionResult> {
  const index = await getSectionIndex();
  const section = findSection(index, sectionId);

  if (!section) {
    // Provide suggestions for close matches
    const suggestions = findSimilarSections(index, sectionId);
    const msg =
      suggestions.length > 0
        ? `Section "${sectionId}" not found. Did you mean: ${suggestions.join(', ')}?`
        : `Section "${sectionId}" not found. Use get_structure to see available sections.`;
    throw new Error(msg);
  }

  // Check content cache
  const cacheKey = `${section.sectionNumber}:${section.page}-${section.endPage}`;
  const cached = sectionContentCache.get(cacheKey);
  if (cached) {
    return {
      sectionNumber: section.sectionNumber,
      title: section.title,
      pageRange: { start: section.page, end: section.endPage },
      content: cached,
    };
  }

  const pdfPath = getPdfPath();
  const doc = await loadDocument(pdfPath);
  const content = await extractSectionContent(
    doc,
    section.page,
    section.endPage,
    section.sectionNumber
  );

  sectionContentCache.set(cacheKey, content);

  return {
    sectionNumber: section.sectionNumber,
    title: section.title,
    pageRange: { start: section.page, end: section.endPage },
    content,
  };
}

/**
 * Search the specification
 */
export async function searchSpec(query: string, maxResults: number): Promise<SearchHit[]> {
  const index = await getSectionIndex();

  if (!searchIndexPromise) {
    const pdfPath = getPdfPath();
    const doc = await loadDocument(pdfPath);
    logger.info('PDFService', 'Building search index (this may take a few seconds)...');
    searchIndexPromise = buildSearchIndex(doc, index);
  }

  const searchIdx = await searchIndexPromise;
  return searchTextIndex(searchIdx, query, maxResults, index);
}

/**
 * Get requirements, optionally filtered by section and/or level.
 * With section filter: extracts from that section + subsections (fast).
 * Without section filter: builds full requirements index lazily (slow on first call).
 */
export async function getRequirements(
  section?: string,
  level?: ISORequirementLevel
): Promise<RequirementsResult> {
  let allRequirements: Requirement[];

  if (section) {
    // Fast path: extract from specific section + subsections
    const index = await getSectionIndex();
    const matchingSections = index.flatOrder.filter(
      (s) => s.sectionNumber === section || s.sectionNumber.startsWith(section + '.')
    );

    if (matchingSections.length === 0) {
      throw new Error(
        `Section "${section}" not found. Use get_structure to see available sections.`
      );
    }

    allRequirements = [];
    for (const sec of matchingSections) {
      const result = await getSectionContent(sec.sectionNumber);
      const reqs = extractRequirementsFromContent(result.content, sec.sectionNumber, result.title);
      allRequirements.push(...reqs);
    }
  } else {
    // Full scan: build or reuse cached index
    if (!requirementsIndexPromise) {
      logger.info('PDFService', 'Building requirements index (this may take a while)...');
      requirementsIndexPromise = buildRequirementsIndex();
    }
    allRequirements = await requirementsIndexPromise;
  }

  // Apply level filter
  const filtered = level ? allRequirements.filter((r) => r.level === level) : allRequirements;

  // Build statistics
  const statistics: Record<string, number> = {};
  for (const req of filtered) {
    statistics[req.level] = (statistics[req.level] || 0) + 1;
  }

  return {
    filter: { section: section || 'all', level: level || 'all' },
    totalRequirements: filtered.length,
    statistics,
    requirements: filtered,
  };
}

async function buildRequirementsIndex(): Promise<Requirement[]> {
  const index = await getSectionIndex();
  const allRequirements: Requirement[] = [];

  for (const sec of index.flatOrder) {
    try {
      const result = await getSectionContent(sec.sectionNumber);
      const reqs = extractRequirementsFromContent(result.content, sec.sectionNumber, result.title);
      allRequirements.push(...reqs);
    } catch {
      // Skip sections that fail to extract
      continue;
    }
  }

  logger.info('PDFService', `Requirements index built: ${allRequirements.length} requirements`);
  return allRequirements;
}

/**
 * Get definitions, optionally filtered by term keyword.
 */
export async function getDefinitions(term?: string): Promise<DefinitionsResult> {
  if (!definitionsPromise) {
    logger.info('PDFService', 'Extracting definitions from Section 3...');
    const index = await getSectionIndex();
    definitionsPromise = extractAllDefinitions(index, getSectionContent);
  }

  let definitions = await definitionsPromise;

  if (term) {
    const searchTerm = term.toLowerCase();
    definitions = definitions.filter(
      (d) =>
        d.term.toLowerCase().includes(searchTerm) || d.definition.toLowerCase().includes(searchTerm)
    );
  }

  return {
    totalDefinitions: definitions.length,
    searchTerm: term,
    definitions,
  };
}

/**
 * Get tables from a specific section.
 */
export async function getTables(sectionId: string, tableIndex?: number): Promise<TablesResult> {
  const result = await getSectionContent(sectionId);

  // Collect tables with captions
  const tables: TableInfo[] = [];
  let idx = 0;

  for (let i = 0; i < result.content.length; i++) {
    const element = result.content[i];
    if (element.type !== 'table') continue;

    // Try to detect caption from preceding paragraph
    let caption: string | null = null;
    if (i > 0) {
      const prev = result.content[i - 1];
      if (prev.type === 'paragraph' && /^Table\s+\d+/.test(prev.text)) {
        caption = prev.text;
      }
    }

    tables.push({
      index: idx++,
      caption,
      headers: element.headers,
      rows: element.rows,
    });
  }

  if (tableIndex !== undefined) {
    if (tableIndex >= tables.length) {
      throw new Error(
        `table_index ${tableIndex} out of range. Section "${sectionId}" has ${tables.length} table(s).`
      );
    }
    return {
      section: result.sectionNumber,
      sectionTitle: result.title,
      totalTables: 1,
      tables: [tables[tableIndex]],
    };
  }

  return {
    section: result.sectionNumber,
    sectionTitle: result.title,
    totalTables: tables.length,
    tables,
  };
}

/**
 * Find similar section numbers for error suggestions
 */
function findSimilarSections(index: SectionIndex, query: string): string[] {
  const lower = query.toLowerCase();
  const suggestions: string[] = [];

  for (const info of index.flatOrder) {
    const key = info.sectionNumber.toLowerCase();
    // Prefix match or substring match
    if (key.startsWith(lower) || lower.startsWith(key)) {
      suggestions.push(info.sectionNumber);
      if (suggestions.length >= 5) break;
    }
  }

  return suggestions;
}
