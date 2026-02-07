/**
 * Version Comparison Service
 * Builds section mapping between PDF 1.7 and PDF 2.0 using title-based matching.
 *
 * Algorithm:
 *   1. Get SectionIndex for both pdf17 and iso32000-2
 *   2. Build normalized title maps for each version
 *   3. Match sections by normalized title (exact match)
 *   4. Fallback: match with parent context for generic titles ("General", etc.)
 *   5. Unmatched sections are classified as added (PDF 2.0 only) or removed (PDF 1.7 only)
 *
 * Results are cached — full comparison runs once, then filtered per request.
 */

import { getSectionIndex } from './pdf-service.js';
import { logger } from '../utils/logger.js';
import type {
  SectionIndex,
  SectionInfo,
  SectionMapping,
  UnmatchedSection,
  CompareVersionsResult,
} from '../types/index.js';

// ========================================
// Cache
// ========================================

let fullComparePromise: Promise<FullCompareResult> | null = null;

interface FullCompareResult {
  matched: SectionMapping[];
  added: UnmatchedSection[];
  removed: UnmatchedSection[];
}

// ========================================
// Public API
// ========================================

/**
 * Compare sections between PDF 1.7 and PDF 2.0.
 * @param section - Optional PDF 2.0 section number to filter results
 */
export async function compareVersions(section?: string): Promise<CompareVersionsResult> {
  // Build or reuse cached full comparison
  if (!fullComparePromise) {
    logger.info('CompareService', 'Building version comparison (first call)...');
    fullComparePromise = buildFullComparison();
  }

  const full = await fullComparePromise;

  // Apply section filter if specified
  if (section) {
    const prefix = section + '.';
    const matched = full.matched.filter(
      (m) =>
        m.section20 === section ||
        m.section20.startsWith(prefix) ||
        m.section17 === section ||
        m.section17.startsWith(prefix)
    );
    const added = full.added.filter(
      (a) => a.section === section || a.section.startsWith(prefix)
    );
    const removed = full.removed.filter(
      (r) => r.section === section || r.section.startsWith(prefix)
    );

    return {
      totalMatched: matched.length,
      totalAdded: added.length,
      totalRemoved: removed.length,
      matched,
      added,
      removed,
    };
  }

  return {
    totalMatched: full.matched.length,
    totalAdded: full.added.length,
    totalRemoved: full.removed.length,
    matched: full.matched,
    added: full.added,
    removed: full.removed,
  };
}

// ========================================
// Internal
// ========================================

/**
 * Build full section comparison between PDF 1.7 and PDF 2.0.
 */
async function buildFullComparison(): Promise<FullCompareResult> {
  const start = Date.now();

  // Load both section indexes
  const [index17, index20] = await Promise.all([
    getSectionIndex('pdf17'),
    getSectionIndex('iso32000-2'),
  ]);

  // Build normalized title maps
  const titleMap20 = buildTitleMap(index20);
  const contextTitleMap20 = buildContextTitleMap(index20);
  const matched20Sections = new Set<string>();

  const matched: SectionMapping[] = [];
  const removed: UnmatchedSection[] = [];

  // Match PDF 1.7 sections against PDF 2.0
  for (const sec17 of index17.flatOrder) {
    const normalized = normalizeTitle(sec17.title);
    if (!normalized) continue; // Skip untitled sections

    // Phase 1: Exact title match
    const candidates = titleMap20.get(normalized);
    if (candidates && candidates.length === 1) {
      const sec20 = candidates[0];
      if (!matched20Sections.has(sec20.sectionNumber)) {
        matched.push(buildMapping(sec17, sec20));
        matched20Sections.add(sec20.sectionNumber);
        continue;
      }
    }

    // Phase 2: Multiple candidates — use parent context to disambiguate
    if (candidates && candidates.length > 1) {
      const contextMatch = findContextMatch(sec17, candidates, index17, index20);
      if (contextMatch && !matched20Sections.has(contextMatch.sectionNumber)) {
        matched.push(buildMapping(sec17, contextMatch));
        matched20Sections.add(contextMatch.sectionNumber);
        continue;
      }
    }

    // Phase 3: No exact match — try context-based matching
    if (!candidates) {
      const contextKey = buildContextKey(sec17, index17);
      const contextCandidates = contextTitleMap20.get(contextKey);
      if (contextCandidates && contextCandidates.length === 1) {
        const sec20 = contextCandidates[0];
        if (!matched20Sections.has(sec20.sectionNumber)) {
          matched.push(buildMapping(sec17, sec20));
          matched20Sections.add(sec20.sectionNumber);
          continue;
        }
      }
    }

    // No match found — section was removed in PDF 2.0
    removed.push({
      section: sec17.sectionNumber,
      title: sec17.title,
      version: 'pdf17',
    });
  }

  // Collect PDF 2.0 sections that had no match (added in 2.0)
  const added: UnmatchedSection[] = [];
  for (const sec20 of index20.flatOrder) {
    if (!matched20Sections.has(sec20.sectionNumber)) {
      added.push({
        section: sec20.sectionNumber,
        title: sec20.title,
        version: 'pdf20',
      });
    }
  }

  const elapsed = Date.now() - start;
  logger.info(
    'CompareService',
    `Comparison built in ${elapsed}ms: ${matched.length} matched, ` +
      `${added.length} added, ${removed.length} removed`
  );

  return { matched, added, removed };
}

// ========================================
// Title normalization
// ========================================

/**
 * Normalize section title for comparison.
 * Strips section numbers, lowercases, collapses whitespace.
 */
function normalizeTitle(title: string): string {
  return title
    .replace(/[\u200B-\u200F\uFEFF]/g, '') // zero-width chars
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Build a map of normalized title → SectionInfo[] for a given index.
 */
function buildTitleMap(index: SectionIndex): Map<string, SectionInfo[]> {
  const map = new Map<string, SectionInfo[]>();
  for (const sec of index.flatOrder) {
    const key = normalizeTitle(sec.title);
    if (!key) continue;
    const existing = map.get(key);
    if (existing) {
      existing.push(sec);
    } else {
      map.set(key, [sec]);
    }
  }
  return map;
}

/**
 * Build context-aware title map: "parentTitle > title" → SectionInfo[]
 */
function buildContextTitleMap(index: SectionIndex): Map<string, SectionInfo[]> {
  const map = new Map<string, SectionInfo[]>();
  for (const sec of index.flatOrder) {
    const key = buildContextKey(sec, index);
    const existing = map.get(key);
    if (existing) {
      existing.push(sec);
    } else {
      map.set(key, [sec]);
    }
  }
  return map;
}

/**
 * Build a context key: "parentTitle > title" for disambiguation.
 */
function buildContextKey(sec: SectionInfo, index: SectionIndex): string {
  const title = normalizeTitle(sec.title);
  if (sec.parent) {
    const parent = index.sections.get(sec.parent);
    if (parent) {
      return `${normalizeTitle(parent.title)} > ${title}`;
    }
  }
  return title;
}

// ========================================
// Matching helpers
// ========================================

/**
 * Among multiple PDF 2.0 candidates with the same title,
 * find the one whose parent context best matches the PDF 1.7 section's parent.
 */
function findContextMatch(
  sec17: SectionInfo,
  candidates20: SectionInfo[],
  index17: SectionIndex,
  index20: SectionIndex
): SectionInfo | null {
  const context17 = buildContextKey(sec17, index17);

  for (const candidate of candidates20) {
    const context20 = buildContextKey(candidate, index20);
    if (context17 === context20) {
      return candidate;
    }
  }

  // No context match found
  return null;
}

/**
 * Build a SectionMapping from matched PDF 1.7 and PDF 2.0 sections.
 */
function buildMapping(sec17: SectionInfo, sec20: SectionInfo): SectionMapping {
  const status: SectionMapping['status'] =
    sec17.sectionNumber === sec20.sectionNumber
      ? 'same'
      : normalizeTitle(sec17.title) === normalizeTitle(sec20.title)
        ? 'moved'
        : 'renamed';

  return {
    section17: sec17.sectionNumber,
    section20: sec20.sectionNumber,
    title: sec20.title, // Use PDF 2.0 title as canonical
    status,
  };
}
