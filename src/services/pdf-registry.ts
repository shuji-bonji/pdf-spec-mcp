/**
 * PDF Document Registry
 * Auto-discovers PDFs from PDF_SPEC_DIR and maps spec IDs to file paths.
 *
 * Two-phase initialization:
 *   1. discoverSpecs() — file scan only (path + pattern match)
 *   2. enrichSpecInfo() — open PDF to get pages/outlineEntries (on first tool access)
 */

import { readdir } from 'fs/promises';
import { join, basename } from 'path';
import { PDF_CONFIG, SPEC_PATTERNS, DEFAULT_SPEC_ID } from '../config.js';
import { logger } from '../utils/logger.js';
import type { SpecCategory, SpecId, SpecInfo } from '../types/index.js';

interface RegistryEntry {
  path: string;
  info: SpecInfo;
}

// Registry state
const registry = new Map<SpecId, RegistryEntry>();
let discoveryDone = false;
let discoveryPromise: Promise<void> | null = null;

/**
 * Ensure registry is initialized (discover specs from PDF_SPEC_DIR).
 * Safe to call multiple times — only runs once.
 */
export async function ensureRegistryInitialized(): Promise<void> {
  if (discoveryDone) return;
  if (!discoveryPromise) {
    discoveryPromise = discoverSpecs();
  }
  await discoveryPromise;
}

/**
 * Scan PDF_SPEC_DIR and register matching PDFs.
 */
async function discoverSpecs(): Promise<void> {
  const dir = process.env[PDF_CONFIG.envVar];
  if (!dir) {
    throw new Error(
      `Environment variable ${PDF_CONFIG.envVar} is not set. ` +
        `Set it to the directory containing PDF specification files.`
    );
  }

  let files: string[];
  try {
    files = await readdir(dir);
  } catch (err) {
    throw new Error(`Cannot read PDF_SPEC_DIR "${dir}": ${err}`);
  }

  const pdfFiles = files.filter((f) => f.toLowerCase().endsWith('.pdf'));
  let matched = 0;

  for (const filename of pdfFiles) {
    const pattern = SPEC_PATTERNS.find((p) => p.pattern.test(filename));
    if (!pattern) {
      logger.debug('PDFRegistry', `Skipping unrecognized PDF: ${filename}`);
      continue;
    }

    // Skip if this ID is already registered (first match wins)
    if (registry.has(pattern.id)) {
      logger.debug('PDFRegistry', `Duplicate pattern match for "${pattern.id}", keeping first`);
      continue;
    }

    registry.set(pattern.id, {
      path: join(dir, filename),
      info: {
        id: pattern.id,
        title: pattern.title,
        filename,
        pages: null,
        category: pattern.category,
        outlineEntries: null,
        description: pattern.description,
      },
    });
    matched++;
  }

  discoveryDone = true;
  logger.info(
    'PDFRegistry',
    `Discovered ${matched} specs from ${pdfFiles.length} PDFs in ${dir}`
  );
}

/**
 * Get the file path for a spec ID.
 * Throws if spec is not available.
 */
export function getSpecPath(specId: string): string {
  const entry = registry.get(specId);
  if (!entry) {
    const available = [...registry.keys()].join(', ');
    throw new Error(
      `Specification "${specId}" not found. Available specs: ${available || '(none — run list_specs first)'}`
    );
  }
  return entry.path;
}

/**
 * Get SpecInfo for a spec ID (or undefined if not found).
 */
export function getSpecInfo(specId: string): SpecInfo | undefined {
  return registry.get(specId)?.info;
}

/**
 * List all discovered specs, optionally filtered by category.
 */
export function listSpecs(category?: SpecCategory): SpecInfo[] {
  const all = [...registry.values()].map((e) => e.info);
  if (category) {
    return all.filter((s) => s.category === category);
  }
  return all;
}

/**
 * Check if a spec ID is available.
 */
export function isSpecAvailable(specId: string): boolean {
  return registry.has(specId);
}

/**
 * Resolve a spec ID: return as-is if provided, otherwise return DEFAULT_SPEC_ID.
 * Validates that the resolved ID exists in the registry.
 */
export function resolveSpecId(specId?: string): string {
  const id = specId ?? DEFAULT_SPEC_ID;
  if (!registry.has(id)) {
    const available = [...registry.keys()].join(', ');
    throw new Error(
      `Specification "${id}" not found. Available specs: ${available || '(none)'}`
    );
  }
  return id;
}

/**
 * Update SpecInfo with runtime metadata (pages, outlineEntries).
 * Called by pdf-service after loading/indexing a spec for the first time.
 */
export function enrichSpecInfo(
  specId: string,
  data: { pages?: number; outlineEntries?: number }
): void {
  const entry = registry.get(specId);
  if (!entry) return;

  if (data.pages !== undefined && entry.info.pages === null) {
    entry.info.pages = data.pages;
  }
  if (data.outlineEntries !== undefined && entry.info.outlineEntries === null) {
    entry.info.outlineEntries = data.outlineEntries;
  }
}
