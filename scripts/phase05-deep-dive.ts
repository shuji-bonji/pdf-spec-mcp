/**
 * Phase 0.5 Deep Dive: Detailed structure analysis of key document categories
 *
 * Investigates:
 * 1. StructTree depth and Table role detection (deeper scan)
 * 2. Section number parsing compatibility with existing parseSectionNumber()
 * 3. Unicode/special characters in outline titles
 * 4. Content structure on a content page (H, P, Table, etc.)
 * 5. PDF 1.7 vs 2.0 section mapping feasibility
 */

import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import type { PDFDocumentProxy, RefProxy } from 'pdfjs-dist/types/src/display/api.js';

interface OutlineNode {
  title: string;
  dest: string | unknown[] | null;
  items: OutlineNode[];
}

const PDF_SPEC_DIR = process.env.PDF_SPEC_DIR || join(process.cwd(), 'pdf-spec');

async function loadDoc(pdfPath: string): Promise<PDFDocumentProxy> {
  const data = new Uint8Array(await readFile(pdfPath));
  return (pdfjsLib as any).getDocument({ data }).promise;
}

// Deep StructTree role collection (no depth limit)
function collectAllRoles(node: any, roles: Map<string, number>, depth = 0): void {
  if (!node) return;
  if (node.role) {
    roles.set(node.role, (roles.get(node.role) || 0) + 1);
  }
  if (node.children) {
    for (const child of node.children) {
      if (typeof child === 'object' && child !== null && 'role' in child) {
        collectAllRoles(child, roles, depth + 1);
      }
    }
  }
}

// Check outline title for special characters
function analyzeTitle(title: string): { raw: string; codePoints: string; hasTabs: boolean; hasZeroWidth: boolean; parsed: string | null } {
  const codePoints = [...title].map(c => {
    const cp = c.codePointAt(0)!;
    if (cp < 0x20 || (cp >= 0x200B && cp <= 0x200F) || cp === 0xFEFF) {
      return `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
    }
    return c;
  }).join('');

  // Replicate parseSectionNumber logic
  const numMatch = title.match(/^(\d+(?:\.\d+)*)\s+/);
  const annexMatch = title.match(/^(Annex\s+[A-Z](?:\.\d+)*)/i);
  const parsed = numMatch ? numMatch[1] : (annexMatch ? annexMatch[1] : null);

  return {
    raw: title,
    codePoints,
    hasTabs: title.includes('\t'),
    hasZeroWidth: /[\u200B-\u200F\uFEFF]/.test(title),
    parsed,
  };
}

// Flatten outline to get all entries
function flattenOutline(nodes: OutlineNode[]): OutlineNode[] {
  const flat: OutlineNode[] = [];
  function walk(ns: OutlineNode[]) {
    for (const n of ns) {
      flat.push(n);
      if (n.items) walk(n.items);
    }
  }
  walk(nodes);
  return flat;
}

async function deepDive(filename: string, contentPage: number = 5) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`FILE: ${filename}`);
  console.log('='.repeat(80));

  const doc = await loadDoc(join(PDF_SPEC_DIR, filename));
  console.log(`Pages: ${doc.numPages}`);

  // 1. Outline analysis with special character detection
  const rawOutline = await doc.getOutline();
  if (rawOutline) {
    const flat = flattenOutline(rawOutline);
    console.log(`\n--- Outline: ${flat.length} total entries ---`);

    // Check for special characters in first 10 entries
    let specialCharCount = 0;
    let unparsableCount = 0;
    for (const entry of flat) {
      const analysis = analyzeTitle(entry.title);
      if (analysis.hasZeroWidth || analysis.hasTabs) {
        specialCharCount++;
      }
      if (!analysis.parsed && !['Cover page', 'Contents', 'Foreword', 'Introduction', 'Bibliography', 'Table of Contents', 'Preface'].some(s => entry.title.trim().startsWith(s))) {
        unparsableCount++;
      }
    }
    console.log(`Special chars (tabs/zero-width): ${specialCharCount} entries`);
    console.log(`Entries without parseable section number: ${unparsableCount}/${flat.length}`);

    // Show parsing results for first 15 entries
    console.log('\nSample outline parsing:');
    for (const entry of flat.slice(0, 15)) {
      const a = analyzeTitle(entry.title);
      const special = a.hasZeroWidth ? ' [ZERO-WIDTH]' : (a.hasTabs ? ' [TAB]' : '');
      console.log(`  "${a.raw.substring(0, 60)}"${special} → parsed: ${a.parsed || '(null)'}`);
    }

    // Show all Annex entries
    const annexEntries = flat.filter(e => e.title.toLowerCase().includes('annex') || e.title.toLowerCase().includes('appendix'));
    if (annexEntries.length > 0) {
      console.log(`\nAnnex/Appendix entries (${annexEntries.length}):`);
      for (const e of annexEntries.slice(0, 5)) {
        const a = analyzeTitle(e.title);
        console.log(`  "${a.raw.substring(0, 80)}" → parsed: ${a.parsed || '(null)'}`);
      }
    }
  }

  // 2. Deep StructTree on content page
  const pageNum = Math.min(contentPage, doc.numPages);
  try {
    const page = await doc.getPage(pageNum);
    const tree = await page.getStructTree();
    if (tree) {
      const roles = new Map<string, number>();
      collectAllRoles(tree, roles);
      console.log(`\n--- StructTree (page ${pageNum}) ---`);
      console.log('Role counts:');
      const sorted = [...roles.entries()].sort((a, b) => b[1] - a[1]);
      for (const [role, count] of sorted) {
        console.log(`  ${role}: ${count}`);
      }
    } else {
      console.log(`\n--- StructTree (page ${pageNum}): NOT FOUND ---`);
    }
  } catch (err) {
    console.log(`\n--- StructTree (page ${pageNum}): ERROR: ${err} ---`);
  }

  // Also check a later page for tables
  const tableScanPages = [pageNum, Math.min(pageNum + 3, doc.numPages), Math.min(doc.numPages, pageNum + 10)];
  let foundTable = false;
  for (const p of tableScanPages) {
    try {
      const page = await doc.getPage(p);
      const tree = await page.getStructTree();
      if (tree) {
        const roles = new Map<string, number>();
        collectAllRoles(tree, roles);
        if (roles.has('Table') || roles.has('TR') || roles.has('TD') || roles.has('TH')) {
          console.log(`\n  Table found on page ${p}! Roles: ${[...roles.keys()].filter(r => ['Table', 'TR', 'TD', 'TH', 'THead', 'TBody'].includes(r)).join(', ')}`);
          foundTable = true;
          break;
        }
      }
    } catch { /* skip */ }
  }
  if (!foundTable) {
    console.log(`  No Table role found on pages ${tableScanPages.join(', ')}`);
  }

  await doc.destroy();
}

// PDF 1.7 vs 2.0 section comparison
async function compareSections() {
  console.log(`\n${'='.repeat(80)}`);
  console.log('COMPARISON: PDF 1.7 (PDF32000_2008) vs PDF 2.0 (ISO_32000-2_sponsored-ec2)');
  console.log('='.repeat(80));

  const doc17 = await loadDoc(join(PDF_SPEC_DIR, 'PDF32000_2008.pdf'));
  const doc20 = await loadDoc(join(PDF_SPEC_DIR, 'ISO_32000-2_sponsored-ec2.pdf'));

  const outline17 = await doc17.getOutline();
  const outline20 = await doc20.getOutline();

  if (outline17 && outline20) {
    // Compare top-level sections
    console.log('\nTop-level section comparison:');
    console.log('  PDF 1.7:');
    for (const e of outline17.slice(0, 20)) {
      const a = analyzeTitle(e.title);
      console.log(`    ${a.parsed || '—'}: ${e.title.substring(0, 50)}`);
    }
    console.log('  PDF 2.0:');
    for (const e of outline20.slice(0, 20)) {
      const a = analyzeTitle(e.title);
      console.log(`    ${a.parsed || '—'}: ${e.title.substring(0, 50)}`);
    }

    // Look for matching section titles
    const flat17 = flattenOutline(outline17);
    const flat20 = flattenOutline(outline20);

    const titles17 = new Map<string, string>();
    for (const e of flat17) {
      const a = analyzeTitle(e.title);
      if (a.parsed) {
        // Extract title part (after section number)
        const titlePart = e.title.replace(/^\d+(?:\.\d+)*\s+/, '').replace(/^Annex\s+[A-Z]\s+/, '').trim().toLowerCase();
        titles17.set(titlePart, a.parsed);
      }
    }

    const titles20 = new Map<string, string>();
    for (const e of flat20) {
      const a = analyzeTitle(e.title);
      if (a.parsed) {
        const titlePart = e.title.replace(/^\d+(?:\.\d+)*\s+/, '').replace(/^Annex\s+[A-Z]\s+/, '').trim().toLowerCase();
        titles20.set(titlePart, a.parsed);
      }
    }

    // Find matching titles
    let matchCount = 0;
    const matches: Array<{title: string; section17: string; section20: string}> = [];
    for (const [title, sec17] of titles17) {
      if (title.length < 3) continue;
      const sec20 = titles20.get(title);
      if (sec20) {
        matchCount++;
        if (matches.length < 30) {
          matches.push({ title: title.substring(0, 50), section17: sec17, section20: sec20 });
        }
      }
    }

    console.log(`\nTitle-based matches: ${matchCount} sections`);
    console.log(`PDF 1.7 total: ${flat17.length}, PDF 2.0 total: ${flat20.length}`);
    console.log('\nSample matches (PDF 1.7 → PDF 2.0):');
    for (const m of matches) {
      const changed = m.section17 !== m.section20 ? ' ← DIFFERENT' : '';
      console.log(`  ${m.section17.padEnd(10)} → ${m.section20.padEnd(10)} "${m.title}"${changed}`);
    }
  }

  await doc17.destroy();
  await doc20.destroy();
}

async function main() {
  console.log('=== Phase 0.5 Deep Dive ===\n');

  // Category 1: ISO TS documents (Phase 3 scope)
  await deepDive('ISO_TS_32001-2022_sponsored.pdf', 7);
  await deepDive('ISO_TS_32002-2022_sponsored.pdf', 7);
  await deepDive('ISO_TS_32003-2023_sponsored.pdf', 7);

  // Category 2: TS 32004/32005 (out of scope but informative)
  await deepDive('ISO-TS-32004-2024_sponsored.pdf', 7);
  await deepDive('ISO-TS-32005-2023-sponsored.pdf', 7);

  // Category 3: PDF/UA
  await deepDive('ISO-14289-1-2014-sponsored.pdf', 7);
  await deepDive('ISO-14289-2-2024-sponsored.pdf', 7);

  // Category 4: PDF 1.7 (for compare_versions)
  await deepDive('PDF32000_2008.pdf', 20);

  // Category 5: PDF Association documents
  await deepDive('PDF20_AN002-AF.pdf', 5);
  await deepDive('Tagged-PDF-Best-Practice-Guide.pdf', 10);
  await deepDive('Well-Tagged-PDF-WTPDF-1.0.pdf', 10);

  // Cross-version comparison
  await compareSections();

  console.log('\n=== Deep Dive Complete ===');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
