/**
 * PDF Service
 * Orchestration layer with per-spec caching for all PDF operations.
 *
 * All public functions accept an optional `specId` parameter.
 * When omitted, the default spec (iso32000-2) is used via resolveSpecId().
 */

import { CACHE_CONFIG } from '../config.js';
import { LRUCache } from '../utils/cache.js';
import { logger } from '../utils/logger.js';
import { loadDocument, reloadDocument, getOutlineWithPages } from './pdf-loader.js';
import { buildSectionIndex, findSection } from './outline-resolver.js';
import { extractSectionContent } from './content-extractor.js';
import { buildSearchIndex, searchTextIndex } from './search-index.js';
import { extractRequirementsFromContent } from './requirement-extractor.js';
import { extractAllDefinitions } from './definition-extractor.js';
import { getSpecPath, resolveSpecId, enrichSpecInfo } from './pdf-registry.js';
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

// ========================================
// Per-spec caches (Map<SpecId, Promise<T>>)
// ========================================

const sectionIndexMap = new Map<string, Promise<SectionIndex>>();
const searchIndexMap = new Map<string, Promise<TextIndex>>();
const requirementsIndexMap = new Map<string, Promise<Requirement[]>>();
const definitionsMap = new Map<string, Promise<Definition[]>>();

// Section content cache (shared across specs, keyed with specId prefix)
const sectionContentCache = new LRUCache<string, ContentElement[]>(CACHE_CONFIG.sectionContent);

// Definition extraction is only supported for specs with compatible Section 3 structure
const DEFINITIONS_SUPPORTED_SPECS = new Set(['iso32000-2', 'iso32000-2-2020', 'pdf17']);

// ========================================
// Section Index
// ========================================

/**
 * Get section index (lazy initialization, cached per spec)
 */
export async function getSectionIndex(specId?: string): Promise<SectionIndex> {
  const id = resolveSpecId(specId);
  if (!sectionIndexMap.has(id)) {
    sectionIndexMap.set(id, initSectionIndex(id));
  }
  return sectionIndexMap.get(id)!;
}

async function initSectionIndex(specId: string): Promise<SectionIndex> {
  const pdfPath = getSpecPath(specId);
  const doc = await loadDocument(pdfPath);
  const outline = await getOutlineWithPages(doc);
  const index = buildSectionIndex(outline, doc.numPages);

  // Enrich registry with runtime metadata
  enrichSpecInfo(specId, {
    pages: doc.numPages,
    outlineEntries: index.sections.size,
  });

  logger.info(
    'PDFService',
    `[${specId}] Section index built: ${index.sections.size} sections, ${doc.numPages} pages`
  );
  return index;
}

// ========================================
// Section Content
// ========================================

/**
 * Get section content by section identifier
 */
export async function getSectionContent(
  sectionId: string,
  specId?: string
): Promise<SectionResult> {
  const id = resolveSpecId(specId);
  const index = await getSectionIndex(id);
  const section = findSection(index, sectionId);

  if (!section) {
    const suggestions = findSimilarSections(index, sectionId);
    const msg =
      suggestions.length > 0
        ? `Section "${sectionId}" not found. Did you mean: ${suggestions.join(', ')}?`
        : `Section "${sectionId}" not found. Use get_structure to see available sections.`;
    throw new Error(msg);
  }

  // Check content cache (keyed with specId prefix)
  const cacheKey = `${id}:${section.sectionNumber}:${section.page}-${section.endPage}`;
  const cached = sectionContentCache.get(cacheKey);
  if (cached) {
    return {
      sectionNumber: section.sectionNumber,
      title: section.title,
      pageRange: { start: section.page, end: section.endPage },
      content: cached,
    };
  }

  const pdfPath = getSpecPath(id);
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

// ========================================
// Search
// ========================================

/**
 * Search the specification
 */
export async function searchSpec(
  query: string,
  maxResults: number,
  specId?: string
): Promise<SearchHit[]> {
  const id = resolveSpecId(specId);
  const index = await getSectionIndex(id);

  if (!searchIndexMap.has(id)) {
    const pdfPath = getSpecPath(id);
    // Force-reload to reset pdfjs-dist PagesMapper singleton state.
    // Without this, getPage() fails for pages beyond the LAST-loaded document's numPages.
    const doc = await reloadDocument(pdfPath);
    logger.info('PDFService', `[${id}] Building search index (this may take a few seconds)...`);
    searchIndexMap.set(id, buildSearchIndex(doc, index));
  }

  const searchIdx = await searchIndexMap.get(id)!;
  return searchTextIndex(searchIdx, query, maxResults, index);
}

// ========================================
// Requirements
// ========================================

/**
 * Get requirements, optionally filtered by section and/or level.
 * With section filter: extracts from that section + subsections (fast).
 * Without section filter: builds full requirements index lazily (slow on first call).
 */
export async function getRequirements(
  section?: string,
  level?: ISORequirementLevel,
  specId?: string
): Promise<RequirementsResult> {
  const id = resolveSpecId(specId);
  let allRequirements: Requirement[];

  if (section) {
    // Fast path: extract from specific section + subsections
    const index = await getSectionIndex(id);
    const matchingSections = index.flatOrder.filter(
      (s) => s.sectionNumber === section || s.sectionNumber.startsWith(section + '.')
    );

    if (matchingSections.length === 0) {
      throw new Error(
        `Section "${section}" not found. Use get_structure to see available sections.`
      );
    }

    // Only extract from leaf sections to avoid duplicates
    const matchingNumbers = new Set(matchingSections.map((s) => s.sectionNumber));
    const leafSections = matchingSections.filter(
      (s) => !s.children.some((child) => matchingNumbers.has(child))
    );

    allRequirements = [];
    for (const sec of leafSections) {
      const result = await getSectionContent(sec.sectionNumber, id);
      const reqs = extractRequirementsFromContent(result.content, sec.sectionNumber, result.title);
      allRequirements.push(...reqs);
    }
  } else {
    // Full scan: build or reuse cached index
    if (!requirementsIndexMap.has(id)) {
      logger.info('PDFService', `[${id}] Building requirements index (this may take a while)...`);
      requirementsIndexMap.set(id, buildRequirementsIndex(id));
    }
    allRequirements = await requirementsIndexMap.get(id)!;
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

async function buildRequirementsIndex(specId: string): Promise<Requirement[]> {
  const index = await getSectionIndex(specId);
  const allRequirements: Requirement[] = [];

  for (const sec of index.flatOrder) {
    try {
      const result = await getSectionContent(sec.sectionNumber, specId);
      const reqs = extractRequirementsFromContent(result.content, sec.sectionNumber, result.title);
      allRequirements.push(...reqs);
    } catch {
      // Skip sections that fail to extract
      continue;
    }
  }

  logger.info(
    'PDFService',
    `[${specId}] Requirements index built: ${allRequirements.length} requirements`
  );
  return allRequirements;
}

// ========================================
// Definitions
// ========================================

/**
 * Get definitions, optionally filtered by term keyword.
 * Only supported for ISO 32000-2, ISO 32000-2-2020, and PDF 1.7.
 */
export async function getDefinitions(
  term?: string,
  specId?: string
): Promise<DefinitionsResult> {
  const id = resolveSpecId(specId);

  // Guard: definition extraction requires compatible Section 3 structure
  if (!DEFINITIONS_SUPPORTED_SPECS.has(id)) {
    throw new Error(
      `get_definitions is only supported for ISO 32000-2 and PDF 1.7. ` +
        `For "${id}", use get_section with section "3" instead.`
    );
  }

  if (!definitionsMap.has(id)) {
    logger.info('PDFService', `[${id}] Extracting definitions from Section 3...`);
    definitionsMap.set(
      id,
      extractAllDefinitions((sectionId) => getSectionContent(sectionId, id))
    );
  }

  let definitions = await definitionsMap.get(id)!;

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

// ========================================
// Tables
// ========================================

/**
 * Get tables from a specific section.
 * First tries StructTree-based extraction, then falls back to text-based detection.
 */
export async function getTables(
  sectionId: string,
  tableIndex?: number,
  specId?: string
): Promise<TablesResult> {
  const id = resolveSpecId(specId);
  const result = await getSectionContent(sectionId, id);

  // Collect tables from StructTree (type: 'table')
  let tables: TableInfo[] = collectStructTreeTables(result.content);

  // Fallback: text-based table detection if StructTree has no tables
  if (tables.length === 0) {
    tables = detectTablesFromText(result.content);
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

// ========================================
// Private helpers
// ========================================

/**
 * Collect tables from StructTree-extracted content (type: 'table').
 */
function collectStructTreeTables(content: ContentElement[]): TableInfo[] {
  const tables: TableInfo[] = [];

  for (let i = 0; i < content.length; i++) {
    const element = content[i];
    if (element.type !== 'table') continue;

    // Check for caption in preceding paragraph
    let caption: string | null = null;
    if (i > 0) {
      const prev = content[i - 1];
      if (prev.type === 'paragraph' && /^Table\s+\d+/.test(prev.text)) {
        caption = prev.text;
      }
    }

    // Merge with previous table if this is a continuation (same headers, no caption)
    if (
      !caption &&
      tables.length > 0 &&
      element.headers.length > 0 &&
      arraysEqual(tables[tables.length - 1].headers, element.headers)
    ) {
      tables[tables.length - 1].rows.push(...element.rows);
      continue;
    }

    tables.push({
      index: tables.length,
      caption,
      headers: element.headers,
      rows: element.rows,
    });
  }

  return tables;
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Text-based fallback: detect tables from paragraph patterns.
 */
function detectTablesFromText(content: ContentElement[]): TableInfo[] {
  const tables: TableInfo[] = [];
  const TABLE_CAPTION_RE = /^(Table\s+\d+)\s*[—–-]\s*(.+)/;

  for (let i = 0; i < content.length; i++) {
    const el = content[i];
    if (el.type !== 'paragraph') continue;

    const captionMatch = el.text.match(TABLE_CAPTION_RE);
    if (!captionMatch) continue;

    const caption = el.text;

    const rows: string[][] = [];
    let headers: string[] = [];
    let j = i + 1;

    while (j < content.length) {
      const next = content[j];
      if (next.type !== 'paragraph') break;
      if (TABLE_CAPTION_RE.test(next.text)) break;
      if (next.text.length > 300 && !next.text.includes('\t')) break;

      let cells: string[];
      if (next.text.includes('\t')) {
        cells = next.text
          .split('\t')
          .map((c) => c.trim())
          .filter(Boolean);
      } else {
        cells = next.text
          .split(/\s{2,}/)
          .map((c) => c.trim())
          .filter(Boolean);
      }

      if (cells.length >= 2) {
        if (headers.length === 0) {
          headers = cells;
        } else {
          rows.push(cells);
        }
      } else {
        break;
      }
      j++;
    }

    if (headers.length > 0 || rows.length > 0) {
      tables.push({
        index: tables.length,
        caption,
        headers,
        rows,
      });
    }
  }

  return tables;
}

/**
 * Find similar section numbers for error suggestions
 */
function findSimilarSections(index: SectionIndex, query: string): string[] {
  const lower = query.toLowerCase();
  const suggestions: string[] = [];

  for (const info of index.flatOrder) {
    const key = info.sectionNumber.toLowerCase();
    if (key.startsWith(lower) || lower.startsWith(key)) {
      suggestions.push(info.sectionNumber);
      if (suggestions.length >= 5) break;
    }
  }

  return suggestions;
}
