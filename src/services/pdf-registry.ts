/**
 * PDF Document Registry
 * Auto-discovers PDFs from PDF_SPEC_DIR and maps spec IDs to file paths.
 *
 * Two-phase initialization:
 *   1. discoverSpecs() — file scan only (path + pattern match)
 *   2. enrichSpecInfo() — open PDF to get pages/outlineEntries (on first tool access)
 */

import { readdir } from 'fs/promises';
import { join } from 'path';
import { PDF_CONFIG, SPEC_PATTERNS, DEFAULT_SPEC_ID } from '../config.js';
import { RegistryError } from '../errors.js';
import { logger } from '../utils/logger.js';
import type { SpecCategory, SpecId, SpecInfo } from '../types/index.js';

interface RegistryEntry {
  path: string;
  info: SpecInfo;
}

/**
 * RegistryService encapsulates all PDF spec registry functionality
 */
export class RegistryService {
  private registry = new Map<SpecId, RegistryEntry>();
  private discoveryDone = false;
  private discoveryPromise: Promise<void> | null = null;

  /**
   * Ensure registry is initialized (discover specs from PDF_SPEC_DIR).
   * Safe to call multiple times — only runs once.
   */
  async ensureInitialized(): Promise<void> {
    if (this.discoveryDone) return;
    if (!this.discoveryPromise) {
      this.discoveryPromise = this.discoverSpecs();
    }
    await this.discoveryPromise;
  }

  /**
   * Scan PDF_SPEC_DIR and register matching PDFs.
   */
  private async discoverSpecs(): Promise<void> {
    const dir = process.env[PDF_CONFIG.envVar];
    if (!dir) {
      throw new RegistryError(
        `Environment variable ${PDF_CONFIG.envVar} is not set. ` +
          `Set it to the directory containing PDF specification files.`
      );
    }

    let files: string[];
    try {
      files = await readdir(dir);
    } catch (err) {
      throw new RegistryError(`Cannot read PDF_SPEC_DIR "${dir}": ${err}`);
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
      if (this.registry.has(pattern.id)) {
        logger.debug('PDFRegistry', `Duplicate pattern match for "${pattern.id}", keeping first`);
        continue;
      }

      this.registry.set(pattern.id, {
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

    this.discoveryDone = true;
    logger.info(
      'PDFRegistry',
      `Discovered ${matched} specs from ${pdfFiles.length} PDFs in ${dir}`
    );
  }

  /**
   * Get the file path for a spec ID.
   * Throws if spec is not available.
   */
  getSpecPath(specId: string): string {
    const entry = this.registry.get(specId);
    if (!entry) {
      const available = [...this.registry.keys()].join(', ');
      throw new RegistryError(
        `Specification "${specId}" not found. Available specs: ${available || '(none — run list_specs first)'}`
      );
    }
    return entry.path;
  }

  /**
   * Get SpecInfo for a spec ID (or undefined if not found).
   */
  getSpecInfo(specId: string): SpecInfo | undefined {
    return this.registry.get(specId)?.info;
  }

  /**
   * List all discovered specs, optionally filtered by category.
   */
  listSpecs(category?: SpecCategory): SpecInfo[] {
    const all = [...this.registry.values()].map((e) => e.info);
    if (category) {
      return all.filter((s) => s.category === category);
    }
    return all;
  }

  /**
   * Check if a spec ID is available.
   */
  isSpecAvailable(specId: string): boolean {
    return this.registry.has(specId);
  }

  /**
   * Resolve a spec ID: return as-is if provided, otherwise return DEFAULT_SPEC_ID.
   * Validates that the resolved ID exists in the registry.
   */
  resolveSpecId(specId?: string): string {
    const id = specId ?? DEFAULT_SPEC_ID;
    if (!this.registry.has(id)) {
      const available = [...this.registry.keys()].join(', ');
      throw new RegistryError(
        `Specification "${id}" not found. Available specs: ${available || '(none)'}`
      );
    }
    return id;
  }

  /**
   * Update SpecInfo with runtime metadata (pages, outlineEntries).
   * Called by pdf-service after loading/indexing a spec for the first time.
   */
  enrichSpecInfo(specId: string, data: { pages?: number; outlineEntries?: number }): void {
    const entry = this.registry.get(specId);
    if (!entry) return;

    if (data.pages !== undefined && entry.info.pages === null) {
      entry.info.pages = data.pages;
    }
    if (data.outlineEntries !== undefined && entry.info.outlineEntries === null) {
      entry.info.outlineEntries = data.outlineEntries;
    }
  }
}

// Default instance
export const defaultRegistry = new RegistryService();

// Backward compatibility: thin adapters to default instance
export const ensureRegistryInitialized = () => defaultRegistry.ensureInitialized();
export const getSpecPath = (specId: string) => defaultRegistry.getSpecPath(specId);
export const getSpecInfo = (specId: string) => defaultRegistry.getSpecInfo(specId);
export const listSpecs = (category?: SpecCategory) => defaultRegistry.listSpecs(category);
export const isSpecAvailable = (specId: string) => defaultRegistry.isSpecAvailable(specId);
export const resolveSpecId = (specId?: string) => defaultRegistry.resolveSpecId(specId);
export const enrichSpecInfo = (specId: string, data: { pages?: number; outlineEntries?: number }) =>
  defaultRegistry.enrichSpecInfo(specId, data);
