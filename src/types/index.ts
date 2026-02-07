/**
 * PDF Spec MCP - Type Definitions
 */

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
  max_depth?: number;
}

export interface GetSectionArgs {
  section: string;
}

export interface SearchSpecArgs {
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
