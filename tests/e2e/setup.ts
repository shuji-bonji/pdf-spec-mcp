/**
 * E2E Test Common Setup
 *
 * - PDF_SPEC_DIR の検証
 * - ensureRegistryInitialized() の共通呼び出し
 * - PDF 有無判定 (CI/ローカル切替)
 */
import { existsSync } from 'fs';
import { ensureRegistryInitialized } from '../../src/services/pdf-registry.js';

/** PDF_SPEC_DIR が設定済みかつ実在するか */
export const PDF_SPEC_DIR = process.env.PDF_SPEC_DIR ?? './pdf-spec';
export const HAS_PDFS = existsSync(PDF_SPEC_DIR);

/**
 * beforeAll で呼び出す共通初期化。
 * 環境変数を設定し、レジストリを初期化する。
 */
export async function initRegistry(): Promise<void> {
  if (!process.env.PDF_SPEC_DIR) {
    process.env.PDF_SPEC_DIR = PDF_SPEC_DIR;
  }
  await ensureRegistryInitialized();
}

/** 全17仕様の specId リスト */
export const ALL_SPEC_IDS = [
  'iso32000-2',
  'iso32000-2-2020',
  'pdf17',
  'pdf17old',
  'ts32001',
  'ts32002',
  'ts32003',
  'ts32004',
  'ts32005',
  'pdfua1',
  'pdfua2',
  'tagged-bpg',
  'wtpdf',
  'declarations',
  'an001',
  'an002',
  'an003',
] as const;

/** 仕様別の期待値テーブル (get_structure S-1 で使用) */
export const SPEC_EXPECTATIONS: Record<
  string,
  {
    titlePattern: RegExp;
    pagesRange: [number, number];
    sectionsRange: [number, number];
  }
> = {
  'iso32000-2': { titlePattern: /PDF 2\.0/, pagesRange: [900, 1100], sectionsRange: [800, 1200] },
  'iso32000-2-2020': {
    titlePattern: /PDF 2\.0/,
    pagesRange: [900, 1100],
    sectionsRange: [800, 1200],
  },
  pdf17: { titlePattern: /PDF 1\.7/, pagesRange: [700, 800], sectionsRange: [700, 1000] },
  pdf17old: {
    titlePattern: /PDF Reference/,
    pagesRange: [1200, 1400],
    sectionsRange: [500, 1500],
  },
  ts32001: { titlePattern: /32001/, pagesRange: [5, 30], sectionsRange: [5, 50] },
  ts32002: { titlePattern: /32002/, pagesRange: [5, 30], sectionsRange: [5, 50] },
  ts32003: { titlePattern: /32003/, pagesRange: [5, 30], sectionsRange: [5, 50] },
  ts32004: { titlePattern: /32004/, pagesRange: [5, 30], sectionsRange: [5, 50] },
  ts32005: { titlePattern: /32005/, pagesRange: [5, 50], sectionsRange: [5, 100] },
  pdfua1: { titlePattern: /PDF\/UA|14289/, pagesRange: [10, 50], sectionsRange: [10, 100] },
  pdfua2: { titlePattern: /PDF\/UA-2|14289-2/, pagesRange: [30, 80], sectionsRange: [100, 250] },
  'tagged-bpg': { titlePattern: /Tagged/, pagesRange: [50, 100], sectionsRange: [100, 300] },
  wtpdf: { titlePattern: /WTPDF|Well-Tagged/, pagesRange: [40, 80], sectionsRange: [100, 250] },
  declarations: { titlePattern: /Declarations/, pagesRange: [5, 30], sectionsRange: [0, 50] },
  an001: { titlePattern: /AN001|Application Note/, pagesRange: [3, 20], sectionsRange: [3, 30] },
  an002: { titlePattern: /AN002|Application Note/, pagesRange: [3, 20], sectionsRange: [3, 40] },
  an003: { titlePattern: /AN003|Application Note/, pagesRange: [3, 30], sectionsRange: [3, 50] },
};
