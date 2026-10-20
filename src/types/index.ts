/**
 * PDF Spec MCP - Type Definitions
 */

// ========================================
// Document Registry
// ========================================

/** Spec identifier (used as `spec` parameter in tools) */
export type SpecId = string;

/** Category of PDF document */
export type SpecCategory = 'standard' | 'ts' | 'pdfua' | 'guide' | 'appnote';

/** Registered PDF document metadata */
export interface SpecInfo {
  id: SpecId;
  title: string;
  filename: string;
  pages: number | null; // null until PDF is first opened
  category: SpecCategory;
  outlineEntries: number | null; // null until section index is built
  description: string;
}

/** A normative area the corpus does not cover (see config.ts COVERAGE_GAPS) */
export interface CoverageGapInfo {
  area: string;
  standards: string[];
  consequence: string;
}

/** list_specs result */
export interface ListSpecsResult {
  totalSpecs: number;
  specs: SpecInfo[];
  /**
   * What this server cannot answer for.
   *
   * Reported alongside what it *can* answer, because a caller that only sees the corpus has
   * no way to tell "no requirement" from "not in the corpus" — and list_specs is the tool
   * an agent reaches for first.
   */
  coverage: {
    note: string;
    gaps: CoverageGapInfo[];
  };
}

// ========================================
// Version Comparison
// ========================================

/** A matched section pair between two spec versions */
export interface SectionMapping {
  section17: string;
  section20: string;
  title: string;
  status: 'same' | 'moved' | 'renamed';
}

/** A section present in only one version */
export interface UnmatchedSection {
  section: string;
  title: string;
  version: 'pdf17' | 'pdf20';
}

/** compare_versions result */
export interface CompareVersionsResult {
  totalMatched: number;
  totalAdded: number; // PDF 2.0 にのみ存在
  totalRemoved: number; // PDF 1.7 にのみ存在
  matched: SectionMapping[];
  added: UnmatchedSection[];
  removed: UnmatchedSection[];
}

// ========================================
// PDF Document Structure
// ========================================

/** Outline entry from PDF bookmark tree */
export interface OutlineEntry {
  title: string;
  page: number;
  sectionNumber: string | null;
  children: OutlineEntry[];
}

/** Flattened section info for quick lookup */
export interface SectionInfo {
  sectionNumber: string;
  title: string;
  page: number;
  endPage: number;
  depth: number;
  parent: string | null;
  children: string[];
}

/** Section index containing both tree and flat lookup */
export interface SectionIndex {
  tree: OutlineEntry[];
  sections: Map<string, SectionInfo>;
  flatOrder: SectionInfo[];
  totalPages: number;
}

// ========================================
// Structured Content (from StructTree)
// ========================================

export type ContentElement =
  | HeadingElement
  | ParagraphElement
  | ListElement
  | TableElement
  | NoteElement
  | CodeElement;

export interface HeadingElement {
  type: 'heading';
  level: number;
  text: string;
}

export interface ParagraphElement {
  type: 'paragraph';
  text: string;
}

export interface ListElement {
  type: 'list';
  items: string[];
}

export interface TableElement {
  type: 'table';
  headers: string[];
  rows: string[][];
}

export interface NoteElement {
  type: 'note';
  label: string;
  text: string;
}

export interface CodeElement {
  type: 'code';
  text: string;
}

// ========================================
// Tool Results
// ========================================

export interface StructureResult {
  title: string;
  totalPages: number;
  totalSections: number;
  sections: OutlineEntry[];
}

/**
 * How a section's content was cut at each end (#17).
 *
 * Content is cut at headings when they are found; when a heading is not found the cut
 * falls on a page edge, and the content may then carry a neighbour's text or miss its
 * own tail. The reader cannot tell the two cases apart from `content` and `pageRange`
 * alone — for 0.6.2 on pdf17 every section was page-cut and nothing said so.
 */
export type SectionBoundaryStart =
  /** Own heading found; text before it on the first page was dropped. */
  | 'heading'
  /** Own heading not found; content starts at the top of the first page and may include
   *  the tail of the previous section. */
  | 'page';

export type SectionBoundaryEnd =
  /** Cut at the next section's heading (on a shared page, or on the following page after
   *  adopting this section's tail there). */
  | 'heading'
  /** Content ends with its last page and the next section starts on a later page. */
  | 'page'
  /** The next section starts on this section's last page but its heading was not found:
   *  content may include the next section's text. */
  | 'page_shared'
  /** The next section starts on the following page and its heading was not found there:
   *  any tail of this section on that page is held by the next section, not here. */
  | 'next_page_unclaimed'
  /** Last section of the outline; content runs to the end of the document range. */
  | 'document';

export interface SectionBoundary {
  start: SectionBoundaryStart;
  end: SectionBoundaryEnd;
}

export interface SectionResult {
  sectionNumber: string;
  title: string;
  pageRange: { start: number; end: number };
  /** For a parent section: `start` of the section itself, `end` of its last descendant. */
  boundary: SectionBoundary;
  content: ContentElement[];
}

export interface SearchHit {
  section: string;
  title: string;
  page: number;
  snippet: string;
  score: number;
}

export interface SearchResult {
  query: string;
  totalResults: number;
  results: SearchHit[];
}

// Tool argument types are not declared here: since A-4 they are inferred from the Zod
// schemas in utils/validation.ts, which is also what publishes them to MCP and enforces
// them at runtime. One source, no drift.

// ========================================
// Requirements (ISO normative keywords)
// ========================================

/** ISO normative requirement levels (lowercase per ISO/IEC Directives Part 2) */
export type ISORequirementLevel = 'shall' | 'shall not' | 'should' | 'should not' | 'may';

/** A single extracted normative requirement */
export interface Requirement {
  id: string;
  level: ISORequirementLevel;
  text: string;
  section: string;
  sectionTitle: string;
  /** Where the sentence was found. Absent means prose (paragraph / list / note). */
  source?: 'table';
  /**
   * Context for a requirement lifted out of a table, which its sentence alone loses.
   *
   * "The type of annotation ... shall be Highlight, Underline, ..." is unusable without
   * knowing it constrains Table 182's `Subtype` entry. `text` stays verbatim so it can be
   * quoted; the context rides alongside.
   */
  table?: string;
  key?: string;
}

export interface RequirementsResult {
  filter: { section: string; level: string };
  totalRequirements: number;
  statistics: Record<string, number>;
  /**
   * Sections in scope whose own content was cut at a page edge rather than a heading
   * (#17): their requirements may include a neighbour's sentences, or miss the tail.
   * Empty when every section in scope was cut at headings.
   */
  sectionsCutByPage: Array<{ section: string; boundary: SectionBoundary }>;
  requirements: Requirement[];
}

// ========================================
// Definitions (Section 3)
// ========================================

/** A term definition from Section 3 */
export interface Definition {
  term: string;
  definition: string;
  section: string;
  notes?: string[];
  source?: string;
}

export interface DefinitionsResult {
  totalDefinitions: number;
  searchTerm?: string;
  definitions: Definition[];
}

// ========================================
// Tables
// ========================================

/** A table extracted from a section with optional caption */
export interface TableInfo {
  index: number;
  caption: string | null;
  headers: string[];
  rows: string[][];
}

export interface TablesResult {
  section: string;
  sectionTitle: string;
  /** Pages the tables were read from — the section's (and its descendants') content. */
  pageRange: { start: number; end: number };
  /** How that content was cut; see SectionBoundary. 0 tables with a page-cut boundary
   *  says only that no Table element was seen in these pages. */
  boundary: SectionBoundary;
  totalTables: number;
  tables: TableInfo[];
}

// ========================================
// Search Index
// ========================================

export interface PageText {
  page: number;
  section: string;
  text: string;
}

export interface TextIndex {
  pages: PageText[];
  buildTime: number;
}
