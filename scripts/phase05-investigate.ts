/**
 * Phase 0.5: Technical investigation of all PDF files in pdf-spec/
 *
 * Checks each PDF for:
 * 1. Page count
 * 2. Outline (bookmarks) — existence, depth, entry count, sample entries
 * 3. StructTree (Tagged PDF) — existence on first content page
 * 4. Section numbering format
 * 5. Text extractability
 */

import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readFile, readdir } from 'fs/promises';
import { join } from 'path';

// Types
import type { PDFDocumentProxy, RefProxy } from 'pdfjs-dist/types/src/display/api.js';

interface OutlineNode {
  title: string;
  dest: string | unknown[] | null;
  items: OutlineNode[];
}

interface PDFInvestigationResult {
  filename: string;
  fileSize: string;
  pages: number;
  outline: {
    exists: boolean;
    totalEntries: number;
    maxDepth: number;
    topLevelEntries: string[];
    sampleEntries: string[];
    sectionNumberFormat: string;
  };
  structTree: {
    exists: boolean;
    samplePageChecked: number;
    rootRole: string | null;
    childRoles: string[];
    hasTableRole: boolean;
  };
  textExtraction: {
    works: boolean;
    samplePageChecked: number;
    charCount: number;
    sampleText: string;
  };
  metadata: {
    title: string | null;
    author: string | null;
    subject: string | null;
  };
}

const PDF_SPEC_DIR = process.env.PDF_SPEC_DIR || join(process.cwd(), 'pdf-spec');

async function loadDoc(pdfPath: string): Promise<PDFDocumentProxy> {
  const data = new Uint8Array(await readFile(pdfPath));
  return (pdfjsLib as any).getDocument({ data }).promise;
}

function countOutlineEntries(nodes: OutlineNode[]): number {
  let count = 0;
  for (const node of nodes) {
    count++;
    if (node.items) count += countOutlineEntries(node.items);
  }
  return count;
}

function getOutlineMaxDepth(nodes: OutlineNode[], depth = 1): number {
  let maxDepth = depth;
  for (const node of nodes) {
    if (node.items && node.items.length > 0) {
      maxDepth = Math.max(maxDepth, getOutlineMaxDepth(node.items, depth + 1));
    }
  }
  return maxDepth;
}

function collectSampleEntries(nodes: OutlineNode[], maxCount = 10): string[] {
  const entries: string[] = [];
  function collect(ns: OutlineNode[]) {
    for (const n of ns) {
      if (entries.length >= maxCount) return;
      entries.push(n.title);
      if (n.items) collect(n.items);
    }
  }
  collect(nodes);
  return entries;
}

function detectSectionNumberFormat(entries: string[]): string {
  const patterns: Record<string, number> = {};
  for (const title of entries) {
    if (title.match(/^\d+(?:\.\d+)*\s+/)) {
      patterns['numeric (e.g., 7.3.4)'] = (patterns['numeric (e.g., 7.3.4)'] || 0) + 1;
    } else if (title.match(/^Annex\s+[A-Z]/i)) {
      patterns['annex (e.g., Annex A)'] = (patterns['annex (e.g., Annex A)'] || 0) + 1;
    } else if (title.match(/^Clause\s+\d+/i)) {
      patterns['clause (e.g., Clause 7)'] = (patterns['clause (e.g., Clause 7)'] || 0) + 1;
    } else if (title.match(/^[A-Z]\.\d+/)) {
      patterns['letter.num (e.g., A.1)'] = (patterns['letter.num (e.g., A.1)'] || 0) + 1;
    } else {
      patterns['other/title-only'] = (patterns['other/title-only'] || 0) + 1;
    }
  }
  return Object.entries(patterns).map(([k, v]) => `${k}: ${v}`).join(', ') || 'none';
}

function collectStructRoles(node: any, roles: Set<string>, depth = 0): void {
  if (depth > 3) return; // Limit depth for performance
  if (node.role) roles.add(node.role);
  if (node.children) {
    for (const child of node.children) {
      if (typeof child === 'object' && child !== null) {
        collectStructRoles(child, roles, depth + 1);
      }
    }
  }
}

async function investigatePDF(filename: string): Promise<PDFInvestigationResult> {
  const pdfPath = join(PDF_SPEC_DIR, filename);
  const fileData = await readFile(pdfPath);
  const fileSizeMB = (fileData.length / (1024 * 1024)).toFixed(1);

  console.error(`  Loading ${filename} (${fileSizeMB} MB)...`);
  const doc = await loadDoc(pdfPath);

  // 1. Basic info
  const pages = doc.numPages;

  // 2. Metadata
  const meta = await doc.getMetadata().catch(() => null);
  const info = (meta?.info || {}) as any;

  // 3. Outline investigation
  const rawOutline = await doc.getOutline();
  const outlineExists = rawOutline !== null && rawOutline.length > 0;
  let totalEntries = 0;
  let maxDepth = 0;
  let topLevelEntries: string[] = [];
  let allSampleEntries: string[] = [];

  if (outlineExists && rawOutline) {
    totalEntries = countOutlineEntries(rawOutline);
    maxDepth = getOutlineMaxDepth(rawOutline);
    topLevelEntries = rawOutline.map((n: OutlineNode) => n.title);
    allSampleEntries = collectSampleEntries(rawOutline, 20);
  }

  // 4. StructTree investigation (check a few pages)
  let structTreeExists = false;
  let sampleStructPage = 1;
  let rootRole: string | null = null;
  const structRoles = new Set<string>();
  let hasTableRole = false;

  // Try first content page (skip cover page), then page 1
  const pagesToCheck = pages >= 3 ? [3, 5, 1] : [1];
  for (const pageNum of pagesToCheck) {
    if (pageNum > pages) continue;
    try {
      const page = await doc.getPage(pageNum);
      const tree = await page.getStructTree();
      if (tree) {
        structTreeExists = true;
        sampleStructPage = pageNum;
        rootRole = tree.role || null;
        collectStructRoles(tree, structRoles);
        hasTableRole = structRoles.has('Table');
        break;
      }
    } catch {
      // try next page
    }
  }

  // 5. Text extraction test
  let textWorks = false;
  let sampleTextPage = 1;
  let charCount = 0;
  let sampleText = '';

  // Try a content page (not cover)
  const textCheckPage = Math.min(pages, pages >= 3 ? 3 : 1);
  try {
    const page = await doc.getPage(textCheckPage);
    const tc = await page.getTextContent();
    const text = tc.items
      .filter((item: any) => 'str' in item)
      .map((item: any) => item.str)
      .join(' ');
    charCount = text.length;
    textWorks = charCount > 0;
    sampleTextPage = textCheckPage;
    sampleText = text.substring(0, 300);
  } catch {
    // text extraction failed
  }

  // Cleanup
  await doc.destroy();

  return {
    filename,
    fileSize: `${fileSizeMB} MB`,
    pages,
    outline: {
      exists: outlineExists,
      totalEntries,
      maxDepth,
      topLevelEntries: topLevelEntries.slice(0, 15),
      sampleEntries: allSampleEntries,
      sectionNumberFormat: detectSectionNumberFormat(allSampleEntries),
    },
    structTree: {
      exists: structTreeExists,
      samplePageChecked: sampleStructPage,
      rootRole,
      childRoles: Array.from(structRoles).sort(),
      hasTableRole,
    },
    textExtraction: {
      works: textWorks,
      samplePageChecked: sampleTextPage,
      charCount,
      sampleText,
    },
    metadata: {
      title: info.Title || null,
      author: info.Author || null,
      subject: info.Subject || null,
    },
  };
}

async function main() {
  console.error('=== Phase 0.5: PDF Technical Investigation ===\n');
  console.error(`PDF directory: ${PDF_SPEC_DIR}\n`);

  // Get all PDF files
  const files = (await readdir(PDF_SPEC_DIR)).filter(f => f.endsWith('.pdf')).sort();
  console.error(`Found ${files.length} PDF files:\n`);

  const results: PDFInvestigationResult[] = [];

  for (const file of files) {
    try {
      const result = await investigatePDF(file);
      results.push(result);
    } catch (err) {
      console.error(`  ERROR: ${file} — ${err}`);
      results.push({
        filename: file,
        fileSize: 'error',
        pages: 0,
        outline: { exists: false, totalEntries: 0, maxDepth: 0, topLevelEntries: [], sampleEntries: [], sectionNumberFormat: 'error' },
        structTree: { exists: false, samplePageChecked: 0, rootRole: null, childRoles: [], hasTableRole: false },
        textExtraction: { works: false, samplePageChecked: 0, charCount: 0, sampleText: '' },
        metadata: { title: null, author: null, subject: null },
      });
    }
  }

  // Output JSON results to stdout
  console.log(JSON.stringify(results, null, 2));

  // Print summary table to stderr
  console.error('\n=== SUMMARY TABLE ===\n');
  console.error('| File | Pages | Outline | Entries | StructTree | Roles | Section Format |');
  console.error('|------|-------|---------|---------|------------|-------|----------------|');
  for (const r of results) {
    const shortName = r.filename.replace(/\.pdf$/, '').substring(0, 35);
    const roles = r.structTree.childRoles.slice(0, 5).join(',');
    console.error(
      `| ${shortName.padEnd(35)} | ${String(r.pages).padStart(5)} | ${r.outline.exists ? 'YES' : 'NO '} | ${String(r.outline.totalEntries).padStart(5)} | ${r.structTree.exists ? 'YES' : 'NO '} | ${roles.padEnd(20)} | ${r.outline.sectionNumberFormat.substring(0, 30)} |`
    );
  }
  console.error('\n=== Done ===');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
