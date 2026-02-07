# Phase 1: pdf-spec-mcp コア機能（MVP）実装計画

> Status: ✅ 完了（2026-02-07）

## Context

Phase 0 で ISO 32000-2 EC2 PDF（1020ページ、985アウトライン）の技術検証が完了。pdfjs-dist（Apache-2.0）の `getStructTree()` による Tagged PDF 構造取得が可能であることを確認済み。Phase 1 では3つのMCPツールを実装し、AIエージェントからPDF仕様をプログラマティックに参照可能にする。

rfcxml-mcp のアーキテクチャパターンを踏襲する。

## ファイル構成

```
src/
  index.ts                    - MCP サーバーエントリポイント
  config.ts                   - 設定（PACKAGE_INFO, CACHE_CONFIG, PDF_CONFIG）
  types/
    index.ts                  - TypeScript 型定義
  utils/
    cache.ts                  - LRU キャッシュ（rfcxml-mcp から移植）
    logger.ts                 - ロガー（rfcxml-mcp から移植）
    validation.ts             - 入力バリデーション
  services/
    pdf-loader.ts             - pdfjs-dist ラッパー（PDF読み込み、アウトライン取得）
    outline-resolver.ts       - アウトライン → セクション階層 + ページ範囲計算
    content-extractor.ts      - StructTree + TextContent → 構造化コンテンツ
    search-index.ts           - 全文検索インデックス
    pdf-service.ts            - サービスオーケストレーション + キャッシュ
  tools/
    definitions.ts            - ツール定義（Tool[] 配列）
    handlers.ts               - ツールハンドラー
tsconfig.json
vitest.config.ts
```

## 実装ステップ

### Step 1: プロジェクト基盤 ✅

**対象ファイル**: `package.json`, `tsconfig.json`, `vitest.config.ts`

- `package.json` を書き換え:
  - `"type": "module"`, `"name": "@shuji-bonji/pdf-spec-mcp"`
  - `"bin": { "pdf-spec-mcp": "dist/index.js" }`
  - deps: `@modelcontextprotocol/sdk` ^1.26.0, `pdfjs-dist` ^5.4.624
  - devDeps: `typescript` ^5.7.0, `vitest` ^2.1.0, `@types/node` ^22.0.0
  - 不要な依存を削除: `mupdf`, `pdf-parse`, `pdf2json`
  - `"engines": { "node": ">=20.0.0" }`
- `tsconfig.json`: rfcxml-mcp と同一（ES2022, NodeNext, strict, outDir: ./dist）
- `vitest.config.ts`: testTimeout: 60000（PDF処理のため延長）

### Step 2: 型定義 ✅

**対象ファイル**: `src/types/index.ts`

主要な型:
- `OutlineEntry` — アウトラインツリーノード（title, page, sectionNumber, children）
- `SectionInfo` — フラット化セクション情報（page, endPage, depth, parent, children）
- `SectionIndex` — セクションの全体索引（sections Map, tree, flatOrder）
- `ContentElement` — 構造化コンテンツ union 型:
  - `HeadingElement` — 見出し（level, text）
  - `ParagraphElement` — 段落（text）
  - `ListElement` — リスト（items[]）
  - `TableElement` — テーブル（headers[], rows[][]）
  - `NoteElement` — 注記/例（label, text）
  - `CodeElement` — コード（text）
- `StructureResult`, `SectionResult`, `SearchResult` — ツール戻り値
- `GetStructureArgs`, `GetSectionArgs`, `SearchSpecArgs` — ツール引数
- `PageText`, `TextIndex`, `SearchHit` — 検索関連

### Step 3: ユーティリティ ✅

**対象ファイル**: `src/utils/cache.ts`, `src/utils/logger.ts`, `src/utils/validation.ts`

- `cache.ts`: LRU キャッシュ（rfcxml-mcp から移植、汎用的なので変更不要）
- `logger.ts`: stderr ロガー（rfcxml-mcp から移植）
- `validation.ts`:
  - `validateSectionId(id)` — 空文字・フォーマットチェック
  - `validateSearchQuery(query)` — 空文字・最小長チェック
  - `validateMaxDepth(depth)` — 1〜10 範囲チェック
  - `validateMaxResults(max)` — 1〜50 範囲チェック

### Step 4: 設定 ✅

**対象ファイル**: `src/config.ts`

- `PACKAGE_INFO`: package.json から `createRequire` パターンで動的読み込み
- `PDF_CONFIG`:
  - `envVar`: `PDF_SPEC_DIR`
  - `primaryPdf`: `ISO_32000-2_sponsored-ec2.pdf`
- `CACHE_CONFIG`: outline, pageContent, sectionContent, searchIndex の TTL・サイズ設定

### Step 5: サービス層（コアロジック） ✅

#### 5a: `src/services/pdf-loader.ts` — pdfjs-dist ラッパー

- `loadDocument(path)`: PDF読み込み（シンプルなキャッシュ付き）
- `getOutlineWithPages(doc)`: アウトライン取得 + ページ番号解決
  - Array dest: `doc.getPageIndex(dest[0] as RefProxy) + 1`
  - String dest: `doc.getDestination(name)` → `getPageIndex()`
- pdfjs-dist 型の re-export:
  - `PDFDocumentProxy`, `PDFPageProxy`, `TextContent`, `TextItem`, `TextMarkedContent`, `StructTreeNode`, `StructTreeContent`

**実装時の注意点（Phase 0 で判明）:**
```typescript
// ❌ デフォルトエクスポートなし
import pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

// ✅ 名前空間インポート
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

// ❌ 独自型定義は不要
interface PDFDocumentProxy { ... }

// ✅ pdfjs-dist から再エクスポート
export type { PDFDocumentProxy } from 'pdfjs-dist/types/src/display/api.js';

// ❌ getPageIndex に unknown を渡すとエラー
doc.getPageIndex(destArray[0]);

// ✅ RefProxy にキャスト
doc.getPageIndex(destArray[0] as RefProxy);
```

#### 5b: `src/services/outline-resolver.ts` — セクションインデックス構築

- `buildSectionIndex(outline, totalPages)`:
  - DFS順でフラット化 → `Map<string, SectionInfo>`
  - ページ範囲計算: 次のエントリの開始ページ-1 = 現エントリの終了ページ
  - 最後のエントリの終了ページ = `doc.numPages`
- `findSection(index, sectionId)`:
  - 完全一致 → 大文字小文字無視 → Annex ショートハンド（"A" → "Annex A"）
  - 見つからない場合は類似セクションを提案
- `parseSectionNumber(title)` は `pdf-loader.ts` に実装:
  - パターン: `/^(\d+(?:\.\d+)*)\s+/` (数値), `/^(Annex\s+[A-Z](?:\.\d+)*)/i` (Annex)

#### 5c: `src/services/content-extractor.ts` — 構造化コンテンツ抽出 (**最重要**)

- `extractSectionContent(doc, startPage, endPage)`: 複数ページの結合
- `extractPageContent(doc, pageNum)`:
  1. `page.getStructTree()` → セマンティック構造ツリー
  2. `page.getTextContent({ includeMarkedContent: true })` → テキスト + マーカー
  3. `buildTextMap(items)` → `Map<string, string>`（ID → テキスト）
  4. `walkStructTree(tree, textMap)` → `ContentElement[]`
- 要素変換ルール:
  - `H`, `H1`-`H6` → `HeadingElement`（`H` はレベル3扱い）
  - `P` → `ParagraphElement`（`NOTE`/`EXAMPLE` で始まる場合は `NoteElement`）
  - `L`/`LI` → `ListElement`（`Lbl` はスキップ、`LBody` からテキスト抽出）
  - `Table`/`TR`/`TH`/`TD` → `TableElement`
  - `Code` → `CodeElement`
  - `Artifact` → **スキップ**（ヘッダー/フッター/ページ番号）
  - その他コンテナ（`Document`, `Part`, `Sect`, `Div`）→ 再帰
- StructTree なしのフォールバック: プレーンテキストとして ParagraphElement に

**実装時の注意点:**
```typescript
// ❌ TextMarkedContent.id は number ではない
const textMap = new Map<number, string>();

// ✅ string 型
const textMap = new Map<string, string>();
```

#### 5d: `src/services/search-index.ts` — 全文検索

- `buildSearchIndex(doc, sectionIndex)`: 全1020ページのテキスト抽出
  - 実測: 初回約4.2秒（当初想定の7秒より高速）
  - 100ページごとに進捗ログ出力
- `searchTextIndex(index, query, maxResults, sectionIndex)`:
  - 大文字小文字無視の部分文字列検索
  - 出現回数でスコアリング → セクション単位で重複排除 → スニペット生成（前後75文字）

#### 5e: `src/services/pdf-service.ts` — オーケストレーション

- `getPdfPath()`: `PDF_SPEC_DIR` 環境変数からパス解決、ファイル存在確認
- `getSectionIndex()`: 遅延初期化 + キャッシュ（PDF読み込み → アウトライン → インデックス構築）
- `getSectionContent(sectionId)`: セクション特定 → ページ範囲 → コンテンツ抽出（LRUキャッシュ付き）
- `searchSpec(query, maxResults)`: 全文検索（初回はインデックス構築、以降キャッシュ）
- `findSimilarSections(index, query)`: セクションID不一致時の候補提案

### Step 6: ツール定義 + ハンドラー ✅

**対象ファイル**: `src/tools/definitions.ts`, `src/tools/handlers.ts`

3つのツール:

| ツール | 入力 | 出力 |
|--------|------|------|
| `get_structure` | `max_depth?: number` (1-10) | セクション階層ツリー（タイトル、ページ番号、子セクション） |
| `get_section` | `section: string` (必須) | セクション内容（見出し、段落、リスト、テーブル、注記） |
| `search_spec` | `query: string` (必須), `max_results?: number` (1-50, default 10) | 検索結果（セクション、スニペット、ページ番号、スコア） |

ハンドラーレジストリ:
```typescript
export const toolHandlers: Record<string, (args: any) => Promise<unknown>> = {
  get_structure: handleGetStructure,
  get_section: handleGetSection,
  search_spec: handleSearchSpec,
};
```

### Step 7: MCP サーバーエントリポイント ✅

**対象ファイル**: `src/index.ts`

rfcxml-mcp の `index.ts` を踏襲:
- `#!/usr/bin/env node`
- `Server` + `StdioServerTransport`
- `ListToolsRequestSchema` → tools 配列を返す
- `CallToolRequestSchema` → toolHandlers でディスパッチ
- エラーハンドリング: `{ isError: true }` レスポンス
- 結果は `JSON.stringify(result, null, 2)` でフォーマット

### Step 8: ビルド + 動作確認 ✅

- `npm install` → `npm run build` → ビルド成功
- `PDF_SPEC_DIR=./pdf-spec node dist/index.js` でサーバー起動確認
- 3ツール全ての動作を JSON-RPC で検証済み

## リスクと対策

| リスク | 対策 | 結果 |
|--------|------|------|
| StructTree ID と TextContent の紐付け不整合 | 未解決IDはスキップ + ログ出力 | ✅ 問題なし |
| 大セクション（100ページ超）のコンテンツ量 | 警告メッセージ付きで返す。Phase 2 で pagination 追加 | ⏳ 未検証（大セクションのテスト未実施） |
| 検索インデックス構築の7秒ブロック | stderr に進捗ログ。キャッシュで2回目以降は即時 | ✅ 実測4.2秒。キャッシュ後は即時 |
| pdfjs-dist ESM インポート問題 | `pdfjs-dist/legacy/build/pdf.mjs` 使用、`"type": "module"` 設定 | ✅ 解決済み |

## 検証結果

### ビルド
```
npm run build → TypeScript コンパイル成功（エラー0件）
```

### 動作テスト

#### `get_structure({ max_depth: 1 })`
```json
{
  "title": "ISO 32000-2:2020 (PDF 2.0)",
  "totalPages": 1020,
  "totalSections": 985,
  "sections": [ /* 14 top-level sections */ ]
}
```
- 実行時間: ~100ms（PDF読み込み含む初回のみ遅い）

#### `get_section({ section: "7.3.4" })`
```json
{
  "section": "7.3.4",
  "title": "String objects",
  "pages": { "start": 62, "end": 66 },
  "content": [
    { "type": "heading", "level": 3, "text": "7.3.4 String objects" },
    { "type": "heading", "level": 4, "text": "7.3.4.1 General" },
    { "type": "paragraph", "text": "..." },
    { "type": "note", "label": "NOTE 1", "text": "..." },
    { "type": "list", "items": ["..."] },
    { "type": "table", "headers": ["..."], "rows": [["..."]] }
  ]
}
```
- 構造化コンテンツの全タイプ（heading, paragraph, note, list, table）を正常に抽出

#### `search_spec({ query: "digital signature" })`
```json
{
  "query": "digital signature",
  "totalResults": 5,
  "results": [
    {
      "section": "12.8.1",
      "title": "General",
      "page": 592,
      "snippet": "...digital signature...",
      "score": 8
    }
  ]
}
```
- 初回: ~4.2秒（インデックス構築）
- 2回目以降: <10ms（キャッシュ）

## 実装で得られた教訓

### pdfjs-dist 固有の注意点

1. **デフォルトエクスポートなし**: `import * as pdfjsLib` を使用
2. **TextMarkedContent.id は string**: `Map<string, string>` で管理
3. **独自型定義は不要**: `pdfjs-dist/types/src/display/api.js` から re-export
4. **RefProxy キャスト必須**: `getPageIndex()` の引数に `as RefProxy`

### アーキテクチャ

- rfcxml-mcp パターン（tools/ + services/ + utils/）は PDF 仕様にもうまく適合
- サービス層の分離（loader / resolver / extractor / search / orchestrator）により保守性が高い
- LRU キャッシュにより初回以降のレスポンスは高速

---

*Completed: 2026-02-07*
