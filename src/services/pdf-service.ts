/**
 * PDF Service
 * Orchestration layer with per-spec caching for all PDF operations.
 *
 * All public functions accept an optional `specId` parameter.
 * When omitted, the default spec (iso32000-2) is used via resolveSpecId().
 */

import type { PDFDocumentProxy } from 'pdfjs-dist/types/src/display/api.js';
import {
  CACHE_CONFIG,
  CONCURRENCY,
  MAX_TABLE_CONTINUATION_PAGES,
  TABLE_CAPTION_START_RE,
} from '../config.js';
import { ContentError } from '../errors.js';
import type {
  ContentElement,
  Definition,
  DefinitionsResult,
  ISORequirementLevel,
  OutlineEntry,
  Requirement,
  RequirementsResult,
  SearchHit,
  SectionIndex,
  SectionResult,
  TableElement,
  TableInfo,
  TablesResult,
  TextIndex,
} from '../types/index.js';
import { LRUCache } from '../utils/cache.js';
import { mapConcurrent } from '../utils/concurrency.js';
import { logger } from '../utils/logger.js';
import { extractSectionContent } from './content-extractor.js';
import { extractAllDefinitions } from './definition-extractor.js';
import { buildSectionIndex, findSection } from './outline-resolver.js';
import { getOutlineWithPages, loadDocument, reloadDocument } from './pdf-loader.js';
import { enrichSpecInfo, getSpecPath, resolveSpecId } from './pdf-registry.js';
import { extractRequirementsFromContent } from './requirement-extractor.js';
import { buildSearchIndex, searchTextIndex } from './search-index.js';

// ========================================
// PDFSpecService Class
// ========================================

/**
 * Service class for PDF specification operations.
 * Encapsulates all state management and caching logic.
 */
class PDFSpecService {
  // Per-spec caches (Map<SpecId, Promise<T>>)
  private sectionIndexMap: Map<string, Promise<SectionIndex>>;
  private searchIndexMap: Map<string, Promise<TextIndex>>;
  private requirementsIndexMap: Map<string, Promise<Requirement[]>>;
  private definitionsMap: Map<string, Promise<Definition[]>>;

  // Section content cache (shared across specs, keyed with specId prefix)
  private sectionContentCache: LRUCache<string, ContentElement[]>;

  // Definition extraction is only supported for specs with compatible Section 3 structure
  private static readonly DEFINITIONS_SUPPORTED_SPECS: Set<string> = new Set([
    'iso32000-2',
    'iso32000-2-2020',
    'pdf17',
  ]);

  /**
   * Constructor
   * @param registry - Registry service for spec path and ID resolution
   * @param loader - PDF loader service for document operations
   */
  constructor(
    private registry: {
      getSpecPath(id: string): string;
      resolveSpecId(id?: string): string;
      enrichSpecInfo(id: string, data: { pages?: number; outlineEntries?: number }): void;
    },
    private loader: {
      loadDocument(path: string): Promise<PDFDocumentProxy>;
      reloadDocument(path: string): Promise<PDFDocumentProxy>;
      getOutlineWithPages(doc: PDFDocumentProxy): Promise<OutlineEntry[]>;
    },
  ) {
    this.sectionIndexMap = new Map();
    this.searchIndexMap = new Map();
    this.requirementsIndexMap = new Map();
    this.definitionsMap = new Map();
    this.sectionContentCache = new LRUCache(CACHE_CONFIG.sectionContent);
  }

  // ========================================
  // Section Index (public)
  // ========================================

  /**
   * Get section index (lazy initialization, cached per spec)
   */
  public async getSectionIndex(specId?: string): Promise<SectionIndex> {
    const id = this.registry.resolveSpecId(specId);
    // Hold the memoised promise in a local: one lookup, and no non-null assertion.
    let index = this.sectionIndexMap.get(id);
    if (!index) {
      index = this.initSectionIndex(id);
      this.sectionIndexMap.set(id, index);
    }
    return index;
  }

  /**
   * Initialize section index for a spec
   */
  private async initSectionIndex(specId: string): Promise<SectionIndex> {
    const pdfPath = this.registry.getSpecPath(specId);
    const doc = await this.loader.loadDocument(pdfPath);
    const outline = await this.loader.getOutlineWithPages(doc);
    const index = buildSectionIndex(outline, doc.numPages);

    // Enrich registry with runtime metadata
    this.registry.enrichSpecInfo(specId, {
      pages: doc.numPages,
      outlineEntries: index.sections.size,
    });

    logger.info(
      'PDFService',
      `[${specId}] Section index built: ${index.sections.size} sections, ${doc.numPages} pages`,
    );
    return index;
  }

  // ========================================
  // Section Content (public)
  // ========================================

  /**
   * Get section content by section identifier
   */
  public async getSectionContent(sectionId: string, specId?: string): Promise<SectionResult> {
    const id = this.registry.resolveSpecId(specId);
    const index = await this.getSectionIndex(id);
    const section = findSection(index, sectionId);

    if (!section) {
      const suggestions = findSimilarSections(index, sectionId);
      const msg =
        suggestions.length > 0
          ? `Section "${sectionId}" not found. Did you mean: ${suggestions.join(', ')}?`
          : `Section "${sectionId}" not found. Use get_structure to see available sections.`;
      throw new ContentError(msg);
    }

    // Check content cache (keyed with specId prefix)
    const cacheKey = `${id}:${section.sectionNumber}:${section.page}-${section.endPage}`;
    const cached = this.sectionContentCache.get(cacheKey);
    if (cached) {
      return {
        sectionNumber: section.sectionNumber,
        title: section.title,
        pageRange: { start: section.page, end: section.endPage },
        content: cached,
      };
    }

    const pdfPath = this.registry.getSpecPath(id);
    const doc = await this.loader.loadDocument(pdfPath);
    const content = await extractSectionContent(
      doc,
      section.page,
      section.endPage,
      section.sectionNumber,
    );

    this.sectionContentCache.set(cacheKey, content);

    return {
      sectionNumber: section.sectionNumber,
      title: section.title,
      pageRange: { start: section.page, end: section.endPage },
      content,
    };
  }

  // ========================================
  // Search (public)
  // ========================================

  /**
   * Search the specification
   */
  public async searchSpec(
    query: string,
    maxResults: number,
    specId?: string,
  ): Promise<SearchHit[]> {
    const id = this.registry.resolveSpecId(specId);
    const index = await this.getSectionIndex(id);

    let searchIndexPromise = this.searchIndexMap.get(id);
    if (!searchIndexPromise) {
      const pdfPath = this.registry.getSpecPath(id);
      // Force-reload to reset pdfjs-dist PagesMapper singleton state.
      // Without this, getPage() fails for pages beyond the LAST-loaded document's numPages.
      const doc = await this.loader.reloadDocument(pdfPath);
      logger.info('PDFService', `[${id}] Building search index (this may take a few seconds)...`);
      searchIndexPromise = buildSearchIndex(doc, index);
      this.searchIndexMap.set(id, searchIndexPromise);
    }

    const searchIdx = await searchIndexPromise;
    return searchTextIndex(searchIdx, query, maxResults, index);
  }

  // ========================================
  // Requirements (public)
  // ========================================

  /**
   * Get requirements, optionally filtered by section and/or level.
   * With section filter: extracts from that section + subsections (fast).
   * Without section filter: builds full requirements index lazily (slow on first call).
   */
  public async getRequirements(
    section?: string,
    level?: ISORequirementLevel,
    specId?: string,
  ): Promise<RequirementsResult> {
    const id = this.registry.resolveSpecId(specId);
    let allRequirements: Requirement[];

    if (section) {
      // Fast path: extract from specific section + subsections
      const index = await this.getSectionIndex(id);
      const matchingSections = index.flatOrder.filter(
        (s) => s.sectionNumber === section || s.sectionNumber.startsWith(`${section}.`),
      );

      if (matchingSections.length === 0) {
        throw new ContentError(
          `Section "${section}" not found. Use get_structure to see available sections.`,
        );
      }

      // Only extract from leaf sections to avoid duplicates
      const matchingNumbers = new Set(matchingSections.map((s) => s.sectionNumber));
      const leafSections = matchingSections.filter(
        (s) => !s.children.some((child) => matchingNumbers.has(child)),
      );

      allRequirements = [];
      for (const sec of leafSections) {
        const result = await this.getSectionContent(sec.sectionNumber, id);
        const reqs = extractRequirementsFromContent(
          result.content,
          sec.sectionNumber,
          result.title,
        );
        allRequirements.push(...reqs);
      }
    } else {
      // Full scan: build or reuse cached index
      let requirementsPromise = this.requirementsIndexMap.get(id);
      if (!requirementsPromise) {
        logger.info('PDFService', `[${id}] Building requirements index (this may take a while)...`);
        requirementsPromise = this.buildRequirementsIndex(id);
        this.requirementsIndexMap.set(id, requirementsPromise);
      }
      allRequirements = await requirementsPromise;
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

  /**
   * Build requirements index for all sections
   */
  private async buildRequirementsIndex(specId: string): Promise<Requirement[]> {
    const index = await this.getSectionIndex(specId);

    // Process sections in parallel with bounded concurrency
    const results = await mapConcurrent(
      index.flatOrder,
      async (sec) => {
        try {
          const result = await this.getSectionContent(sec.sectionNumber, specId);
          return extractRequirementsFromContent(result.content, sec.sectionNumber, result.title);
        } catch {
          // Skip sections that fail to extract
          return [];
        }
      },
      CONCURRENCY.requirementsIndex,
    );

    const allRequirements = results.flat();

    logger.info(
      'PDFService',
      `[${specId}] Requirements index built: ${allRequirements.length} requirements`,
    );
    return allRequirements;
  }

  // ========================================
  // Definitions (public)
  // ========================================

  /**
   * Get definitions, optionally filtered by term keyword.
   * Only supported for ISO 32000-2, ISO 32000-2-2020, and PDF 1.7.
   */
  public async getDefinitions(term?: string, specId?: string): Promise<DefinitionsResult> {
    const id = this.registry.resolveSpecId(specId);

    // Guard: definition extraction requires compatible Section 3 structure
    if (!PDFSpecService.DEFINITIONS_SUPPORTED_SPECS.has(id)) {
      throw new ContentError(
        `get_definitions is only supported for ISO 32000-2 and PDF 1.7. ` +
          `For "${id}", use get_section with section "3" instead.`,
      );
    }

    let definitionsPromise = this.definitionsMap.get(id);
    if (!definitionsPromise) {
      logger.info('PDFService', `[${id}] Extracting definitions from Section 3...`);
      definitionsPromise = extractAllDefinitions((sectionId) =>
        this.getSectionContent(sectionId, id),
      );
      this.definitionsMap.set(id, definitionsPromise);
    }

    let definitions = await definitionsPromise;

    if (term) {
      const searchTerm = term.toLowerCase();
      definitions = definitions.filter(
        (d) =>
          d.term.toLowerCase().includes(searchTerm) ||
          d.definition.toLowerCase().includes(searchTerm),
      );
    }

    return {
      totalDefinitions: definitions.length,
      searchTerm: term,
      definitions,
    };
  }

  // ========================================
  // Tables (public)
  // ========================================

  /**
   * Get tables from a specific section.
   * First tries StructTree-based extraction, then falls back to text-based detection.
   */
  public async getTables(
    sectionId: string,
    tableIndex?: number,
    specId?: string,
  ): Promise<TablesResult> {
    const id = this.registry.resolveSpecId(specId);
    const result = await this.getSectionContent(sectionId, id);

    // A table may spill past the section's last page (see collectTrailingTableRows).
    // Append those rows before collecting, so the normal continuation rule merges them.
    const content = [
      ...result.content,
      ...(await this.collectTrailingTableRows(id, result.content, result.pageRange.end)),
    ];

    // Collect tables from StructTree (type: 'table')
    let tables: TableInfo[] = collectStructTreeTables(content);

    // Fallback: text-based table detection if StructTree has no tables
    if (tables.length === 0) {
      tables = detectTablesFromText(content);
    }

    if (tableIndex !== undefined) {
      if (tableIndex >= tables.length) {
        throw new ContentError(
          `table_index ${tableIndex} out of range. Section "${sectionId}" has ${tables.length} table(s).`,
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
   * Table rows that live past the section's last page ("the seam").
   *
   * Section page ranges come from the outline as `[page, nextSection.page - 1]`
   * (see outline-resolver), so when a table spills over the section's last page its
   * remaining rows sit at the top of `endPage + 1` — above the next section's heading.
   * That strip belongs to no section today: it is outside this section's page range,
   * and `trimToSectionStart` discards it from the next section's content. Rows are
   * therefore lost outright, which for a canon is fatal:
   *   - Table 182 (12.5.6.10) loses its `QuadPoints` row to p.508
   *   - Table 166 (12.5.2) loses `CA` / `BM` / `Lang` to p.485
   * Continuations *within* a section already merge correctly (collectStructTreeTables),
   * so only this boundary case needs handling.
   *
   * Returns the continuation table elements so collectStructTreeTables merges them by
   * its existing rule (same headers, no caption). Conservative by design — it bails
   * unless the evidence says "this really is the same table continuing":
   *   - the section's content must END with a table (otherwise the table already closed)
   *   - that table must have headers, because a headerless table is exactly what
   *     collectStructTreeTables refuses to merge. Appending rows it will not merge only
   *     invents a spurious extra table (observed in 8.7.4.5.5), which is worse than the
   *     missing row: it shifts every subsequent `table_index`. The rule here must mirror
   *     the merge rule it depends on. Headerless tables therefore still lose spillover
   *     rows — a known gap, tracked rather than papered over.
   *   - the strip above the next heading must start with a table whose headers match
   *   - a `Table N — ...` caption ends the strip: that is a NEW table, not a continuation
   */
  private async collectTrailingTableRows(
    specId: string,
    content: ContentElement[],
    endPage: number,
  ): Promise<ContentElement[]> {
    const last = content[content.length - 1];
    if (last?.type !== 'table' || last.headers.length === 0) return [];

    const doc = await this.loader.loadDocument(this.registry.getSpecPath(specId));
    const collected: ContentElement[] = [];
    let expectedHeaders = last.headers;

    const lastPage = Math.min(endPage + MAX_TABLE_CONTINUATION_PAGES, doc.numPages);
    for (let page = endPage + 1; page <= lastPage; page++) {
      // No sectionNumber → no trimming; we want this page's leading strip verbatim.
      const elements = await extractSectionContent(doc, page, page);

      // The strip ends at the next section's heading, or at a new table's caption.
      const stopIdx = elements.findIndex(
        (el) =>
          el.type === 'heading' ||
          (el.type === 'paragraph' && TABLE_CAPTION_START_RE.test(el.text)),
      );
      const strip = stopIdx === -1 ? elements : elements.slice(0, stopIdx);

      const continuation = strip.find((el): el is TableElement => el.type === 'table');
      if (!continuation || !arraysEqual(continuation.headers, expectedHeaders)) break;

      collected.push(continuation);
      expectedHeaders = continuation.headers;

      // A heading/caption on this page means the table ended here; otherwise the whole
      // page was continuation and it may run onto the next one.
      if (stopIdx !== -1) break;
    }

    return collected;
  }
}

// ========================================
// Module-level helper functions (stateless)
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
      if (prev.type === 'paragraph' && TABLE_CAPTION_START_RE.test(prev.text)) {
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

/**
 * Check if two string arrays are equal
 */
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

// ========================================
// Default instance and backward-compatible exports
// ========================================

/**
 * Default PDF service instance using module-level imports
 */
export const defaultPdfService = new PDFSpecService(
  { getSpecPath, resolveSpecId, enrichSpecInfo },
  { loadDocument, reloadDocument, getOutlineWithPages },
);

/**
 * Backward-compatible function exports
 */
export async function getSectionIndex(specId?: string): Promise<SectionIndex> {
  return defaultPdfService.getSectionIndex(specId);
}

export async function getSectionContent(
  sectionId: string,
  specId?: string,
): Promise<SectionResult> {
  return defaultPdfService.getSectionContent(sectionId, specId);
}

export async function searchSpec(
  query: string,
  maxResults: number,
  specId?: string,
): Promise<SearchHit[]> {
  return defaultPdfService.searchSpec(query, maxResults, specId);
}

export async function getRequirements(
  section?: string,
  level?: ISORequirementLevel,
  specId?: string,
): Promise<RequirementsResult> {
  return defaultPdfService.getRequirements(section, level, specId);
}

export async function getDefinitions(term?: string, specId?: string): Promise<DefinitionsResult> {
  return defaultPdfService.getDefinitions(term, specId);
}

export async function getTables(
  sectionId: string,
  tableIndex?: number,
  specId?: string,
): Promise<TablesResult> {
  return defaultPdfService.getTables(sectionId, tableIndex, specId);
}

// Export the service class for advanced usage
export { PDFSpecService };
