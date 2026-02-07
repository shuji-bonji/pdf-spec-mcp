/**
 * Service Container
 * Creates and wires together all service instances with dependency injection.
 *
 * This module provides a centralized factory for creating service instances,
 * making it easy to substitute dependencies for testing.
 */

import { RegistryService } from './services/pdf-registry.js';
import { DocumentLoaderService } from './services/pdf-loader.js';
import { PDFSpecService } from './services/pdf-service.js';
import { CompareService } from './services/compare-service.js';

export interface ServiceContainer {
  registry: RegistryService;
  loader: DocumentLoaderService;
  pdfService: PDFSpecService;
  compareService: CompareService;
}

/**
 * Create a fully-wired service container.
 *
 * Each service receives its dependencies via constructor injection.
 * For testing, you can create individual services with mock dependencies instead.
 */
export function createServices(): ServiceContainer {
  const registry = new RegistryService();
  const loader = new DocumentLoaderService();
  const pdfService = new PDFSpecService(registry, loader);
  const compareService = new CompareService(pdfService);
  return { registry, loader, pdfService, compareService };
}
