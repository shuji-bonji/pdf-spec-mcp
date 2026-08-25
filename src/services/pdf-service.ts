/**
 * PDF Service
 * Orchestration layer with per-spec caching for all PDF operations.
 *
 * All public functions accept an optional `specId` parameter.
 * When omitted, the default spec (iso32000-2) is used via resolveSpecId().
 */

import type { PDFDocumentProxy } from 'pdfjs-dist/types/src/display/api.js';
import { CACHE_CONFIG, CONCURRENCY } from '../config.js';
import { ContentError, NEXT_ACTIONS } from '../errors.js';
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
  TableInfo,
  TablesResult,
  TextIndex,
} from '../types/index.js';
import { LRUCache } from '../utils/cache.js';
import { mapConcurrent } from '../utils/concurrency.js';
import { logger } from '../utils/logger.js';
import {
  extractOrphanedStrip,
  extractSectionContent,
  trimAfterNextSectionStart,
} from './content-extractor.js';
import { extractAllDefinitions } from './definition-extractor.js';
import {
  defaultIndexStore,
  type IndexKind,
  type IndexPayload,
  type IndexStore,
  type LoadedIndex,
} from './index-store.js';
import { buildSectionIndex, collectSubtree, findSection } from './outline-resolver.js';
import { getOutlineWithPages, loadDocument, reloadDocument } from './pdf-loader.js';
import { enrichSpecInfo, getSpecPath, resolveSpecId } from './pdf-registry.js';
import { extractRequirementsFromContent } from './requirement-extractor.js';
import { buildSearchIndex, searchTextIndex } from './search-index.js';
import { collectStructTreeTables } from './table-collector.js';

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
  private sectionContentCache: LRUCache<string, { content: ContentElement[]; endPage: number }>;

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
    /**
     * On-disk persistence for the search and requirements indexes (Issue #6). Injected so
     * tests can share one store between two service instances and prove the second never
     * touches the loader.
     */
    private store: IndexStore = defaultIndexStore,
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
   * Get section content by section identifier.
   *
   * A parent section returns its entire subtree — its own preamble followed by every
   * descendant's content in document order (SV-1). The pieces are the partitioned
   * per-section contents, which are disjoint by construction (S-9), so concatenation
   * introduces no duplication. Before this, a parent returned only its preamble, and
   * spec-first checks that queried a clause by its parent number never saw normative
   * content that lives only in a child — get_section("12.8.2.2") had no trace of
   * Table 257, whose P entry alone states that DSS/DocTimeStamp incremental updates
   * "shall not be considered as changes".
   */
  public async getSectionContent(sectionId: string, specId?: string): Promise<SectionResult> {
    const id = this.registry.resolveSpecId(specId);
    const index = await this.getSectionIndex(id);

    const own = await this.getOwnSectionContent(sectionId, id);
    const subtree = collectSubtree(index, own.sectionNumber);
    if (subtree.length <= 1) return own;

    // mapConcurrent preserves input order, so descendants stay in document order.
    const descendants = await mapConcurrent(
      subtree.slice(1),
      (sec) => this.getOwnSectionContent(sec.sectionNumber, id),
      CONCURRENCY.requirementsIndex,
    );

    const parts = [own, ...descendants];
    return {
      sectionNumber: own.sectionNumber,
      title: own.title,
      pageRange: {
        start: own.pageRange.start,
        end: Math.max(...parts.map((p) => p.pageRange.end)),
      },
      content: parts.flatMap((p) => p.content),
    };
  }

  /**
   * This section's OWN content: its pages, cut at its heading (start), at the next
   * section's heading when they share a page (end, S-9), plus its strip on the seam
   * page (S-5). These pieces partition the document; the requirements and search
   * indexes are built from them, and getSectionContent concatenates them per subtree.
   */
  private async getOwnSectionContent(sectionId: string, specId: string): Promise<SectionResult> {
    const id = specId;
    const index = await this.getSectionIndex(id);
    const section = findSection(index, sectionId);

    if (!section) {
      const suggestions = findSimilarSections(index, sectionId);
      const msg =
        suggestions.length > 0
          ? `Section "${sectionId}" not found. Did you mean: ${suggestions.join(', ')}?`
          : `Section "${sectionId}" not found. Use get_structure to see available sections.`;
      throw new ContentError(msg, {
        next_actions: [NEXT_ACTIONS.getStructure()],
        retryable: true,
      });
    }

    // Check content cache (keyed with specId prefix)
    const cacheKey = `${id}:${section.sectionNumber}:${section.page}-${section.endPage}`;
    const cached = this.sectionContentCache.get(cacheKey);
    if (cached) {
      return {
        sectionNumber: section.sectionNumber,
        title: section.title,
        pageRange: { start: section.page, end: cached.endPage },
        content: cached.content,
      };
    }

    const pdfPath = this.registry.getSpecPath(id);
    const doc = await this.loader.loadDocument(pdfPath);

    const position = index.flatOrder.indexOf(section);
    const next = position === -1 ? undefined : index.flatOrder[position + 1];

    let content = await extractSectionContent(
      doc,
      section.page,
      section.endPage,
      section.sectionNumber,
    );

    // When the next section starts on this section's last page, the range covers content
    // that belongs to it — cut at its heading (S-9, symptom 2; exact mirror of the start
    // trim, see trimAfterNextSectionStart).
    if (next && next.page === section.endPage) {
      content = trimAfterNextSectionStart(content, next.sectionNumber);
    }

    // This section's tail, stranded on the next section's first page.
    //
    // See extractOrphanedStrip for what the strip is and why adopting it cannot
    // double-count. The condition here is the structural half: a seam exists only when
    // the next section begins on the page right after this one's last. When two sections
    // share a page (`next.page === endPage`), `endPage + 1` is a page the *next* section
    // owns outright, not a seam — reading it here would steal that section's content.
    const strip =
      next && next.page === section.endPage + 1
        ? await extractOrphanedStrip(doc, next.page, next.sectionNumber)
        : [];
    content = [...content, ...strip];

    // A non-empty strip means the section spills onto the next page (S-10): report the
    // page range the content actually spans, or page-based follow-ups (reader read_text,
    // veraPDF checks) stop one page short. The internal endPage is untouched — it drives
    // extraction ranges and cache keys, not what the caller reads.
    const endPage = strip.length > 0 ? section.endPage + 1 : section.endPage;

    this.sectionContentCache.set(cacheKey, { content, endPage });

    return {
      sectionNumber: section.sectionNumber,
      title: section.title,
      pageRange: { start: section.page, end: endPage },
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
      searchIndexPromise = this.loadOrBuildSearchIndex(id, index);
      this.searchIndexMap.set(id, searchIndexPromise);
    }

    const searchIdx = await searchIndexPromise;
    return searchTextIndex(searchIdx, query, maxResults, index);
  }

  /**
   * The search index from disk if this exact PDF was indexed by this exact version before,
   * otherwise built and saved (Issue #6).
   *
   * A hit skips `reloadDocument` entirely — no pdfjs page walk, and no PagesMapper reset —
   * so the cached path never depends on which document was loaded last. Nothing downstream
   * can tell the two apart: `searchTextIndex` walks the same `pages` array either way.
   */
  private async loadOrBuildSearchIndex(specId: string, index: SectionIndex): Promise<TextIndex> {
    const pdfPath = this.registry.getSpecPath(specId);

    const cached = await this.loadIndex('search', specId, pdfPath);
    if (cached) {
      logger.info(
        'PDFService',
        `[${specId}] Search index loaded from cache in ${cached.loadTimeMs}ms (${cached.path})`,
      );
      return { pages: cached.data.pages, buildTime: cached.loadTimeMs };
    }

    // Force-reload to reset pdfjs-dist PagesMapper singleton state.
    // Without this, getPage() fails for pages beyond the LAST-loaded document's numPages.
    const doc = await this.loader.reloadDocument(pdfPath);
    logger.info('PDFService', `[${specId}] Building search index (this may take a few seconds)...`);
    const built = await buildSearchIndex(doc, index);
    await this.saveIndex('search', specId, pdfPath, { pages: built.pages }, built.buildTime);
    return built;
  }

  /**
   * `store.load` / `store.save` are specified never to throw, but the service does not
   * depend on that: a store that does throw is still just a miss (or a lost write). The
   * cache must not be able to fail a tool — PS-C3 pins this for both directions.
   */
  private async loadIndex<K extends IndexKind>(
    kind: K,
    specId: string,
    pdfPath: string,
  ): Promise<LoadedIndex<K> | null> {
    try {
      return await this.store.load(kind, specId, pdfPath);
    } catch (err) {
      logger.warn('PDFService', `[${specId}] ${kind} index cache read failed, rebuilding: ${err}`);
      return null;
    }
  }

  private async saveIndex<K extends IndexKind>(
    kind: K,
    specId: string,
    pdfPath: string,
    data: IndexPayload[K],
    buildTimeMs: number,
  ): Promise<void> {
    try {
      await this.store.save(kind, specId, pdfPath, data, buildTimeMs);
    } catch (err) {
      logger.warn('PDFService', `[${specId}] ${kind} index cache write failed: ${err}`);
    }
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
      // Fast path: extract from the section's subtree. Resolved through the outline's
      // children links (SV-1) — string-prefix matching never reached Annex subsections,
      // whose keys are full titles ("A.1 General"). Each piece is the section's OWN
      // content: since S-9 these partition the document, so walking every node (parents
      // included, for their preambles) cannot double-count. The old code walked leaves
      // only, which was the pre-S-9 workaround for overlapping parents.
      const index = await this.getSectionIndex(id);
      const root = findSection(index, section);

      if (!root) {
        throw new ContentError(
          `Section "${section}" not found. Use get_structure to see available sections.`,
          { next_actions: [NEXT_ACTIONS.getStructure()], retryable: true },
        );
      }

      const subtree = collectSubtree(index, root.sectionNumber);
      const perSection = await mapConcurrent(
        subtree,
        async (sec) => {
          const result = await this.getOwnSectionContent(sec.sectionNumber, id);
          return extractRequirementsFromContent(result.content, sec.sectionNumber, result.title);
        },
        CONCURRENCY.requirementsIndex,
      );
      allRequirements = perSection.flat();
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
    const pdfPath = this.registry.getSpecPath(specId);

    const cached = await this.loadIndex('requirements', specId, pdfPath);
    if (cached) {
      logger.info(
        'PDFService',
        `[${specId}] Requirements index loaded from cache in ${cached.loadTimeMs}ms (${cached.path})`,
      );
      return cached.data;
    }
    const start = Date.now();

    // Process sections in parallel with bounded concurrency
    const results = await mapConcurrent(
      index.flatOrder,
      async (sec) => {
        try {
          // Own content, not the subtree: aggregating parents here would double-count
          // every requirement once per ancestor.
          const result = await this.getOwnSectionContent(sec.sectionNumber, specId);
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
    await this.saveIndex('requirements', specId, pdfPath, allRequirements, Date.now() - start);
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
        {
          hint: 'Other specs do not share the Section 3 "Terms and definitions" structure this parses.',
          next_actions: [
            {
              action: 'call_get_section',
              reason: `Call get_section with section "3" on "${id}" to read its terms verbatim.`,
            },
          ],
          retryable: true,
        },
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

    // Rows that spill onto the next section's first page arrive with the section's content
    // (getSectionContent adopts the orphaned strip), so the continuation rule below merges
    // them like any other. Nothing table-specific is needed here.
    let tables: TableInfo[] = collectStructTreeTables(result.content);

    // Fallback: text-based table detection if StructTree has no tables
    if (tables.length === 0) {
      tables = detectTablesFromText(result.content);
    }

    if (tableIndex !== undefined) {
      if (tableIndex >= tables.length) {
        throw new ContentError(
          `table_index ${tableIndex} out of range. Section "${sectionId}" has ${tables.length} table(s).`,
          {
            next_actions: [
              {
                action: 'omit_table_index',
                reason: `Call get_tables without table_index to see all ${tables.length} table(s) in this section.`,
              },
            ],
            retryable: true,
          },
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
}

// ========================================
// Module-level helper functions (stateless)
// ========================================

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
