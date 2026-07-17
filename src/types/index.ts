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

/** list_specs result */
export interface ListSpecsResult {
  totalSpecs: number;
  specs: SpecInfo[];
}

export interface ListSpecsArgs {
  category?: string;
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

export interface CompareVersionsArgs {
  section?: string; // 特定セクションに絞る（省略時は全体比較）
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

export interface SectionResult {
  sectionNumber: string;
  title: string;
  pageRange: { start: number; end: number };
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

// ========================================
// Tool Arguments
// ========================================

export interface GetStructureArgs {
  spec?: string;
  max_depth?: number;
}

export interface GetSectionArgs {
  spec?: string;
  section: string;
}

export interface SearchSpecArgs {
  spec?: string;
  query: string;
  max_results?: number;
}

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
}

export interface RequirementsResult {
  filter: { section: string; level: string };
  totalRequirements: number;
  statistics: Record<string, number>;
  requirements: Requirement[];
}

export interface GetRequirementsArgs {
  spec?: string;
  section?: string;
  level?: string;
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

export interface GetDefinitionsArgs {
  spec?: string;
  term?: string;
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
  totalTables: number;
  tables: TableInfo[];
}

export interface GetTablesArgs {
  spec?: string;
  section: string;
  table_index?: number;
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
