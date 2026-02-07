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

    // Only extract from leaf sections (no children in the matching set)
    // to avoid duplicates from parent sections including child content
    const matchingNumbers = new Set(matchingSections.map((s) => s.sectionNumber));
    const leafSections = matchingSections.filter(
      (s) => !s.children.some((child) => matchingNumbers.has(child))
    );

    allRequirements = [];
    for (const sec of leafSections) {
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
    definitionsPromise = extractAllDefinitions(getSectionContent);
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
 * First tries StructTree-based extraction, then falls back to text-based detection.
 */
export async function getTables(sectionId: string, tableIndex?: number): Promise<TablesResult> {
  const result = await getSectionContent(sectionId);

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
      // Continuation of previous table across a page boundary
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
 * Looks for "Table N — Title" captions and extracts subsequent lines as table data.
 * Used when the PDF's StructTree lacks proper Table elements.
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

    // Collect subsequent paragraphs as table rows
    // Table data typically has consistent column patterns (tab or multi-space separated)
    const rows: string[][] = [];
    let headers: string[] = [];
    let j = i + 1;

    while (j < content.length) {
      const next = content[j];
      if (next.type !== 'paragraph') break;

      // Stop at next table caption or very long text (paragraph, not table row)
      if (TABLE_CAPTION_RE.test(next.text)) break;
      if (next.text.length > 300 && !next.text.includes('\t')) break;

      // Try to split by tabs first, then by 2+ spaces
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

      // Only treat as a table row if it has 2+ cells
      if (cells.length >= 2) {
        if (headers.length === 0) {
          headers = cells;
        } else {
          rows.push(cells);
        }
      } else {
        // Single cell or no split — end of table
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
    // Prefix match or substring match
    if (key.startsWith(lower) || lower.startsWith(key)) {
      suggestions.push(info.sectionNumber);
      if (suggestions.length >= 5) break;
    }
  }

  return suggestions;
}
