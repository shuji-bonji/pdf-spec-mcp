/**
 * Application Configuration
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const packageJson = require('../package.json') as { name: string; version: string };

export const PACKAGE_INFO = {
  name: packageJson.name,
  version: packageJson.version,
} as const;

export const PDF_CONFIG = {
  envVar: 'PDF_SPEC_DIR',
  primaryPdf: 'ISO_32000-2_sponsored-ec2.pdf',
} as const;

export const CACHE_CONFIG = {
  sectionContent: { maxSize: 50, name: 'SectionContentCache' },
} as const;
