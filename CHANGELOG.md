# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

抽出の正確性に関する大きな修正を含む。`get_section` / `get_requirements` / `get_tables` の
出力が広範に変わる（いずれも**取りこぼしていた内容の回復**であり、失われるものは無い）。

### Fixed

- **セクション境界の「帯」で内容が失われる問題を修正**（正典としての本丸）。
  セクションのページ範囲は outline から `[page, 次セクションの page - 1]` として決まるため、
  最終ページを越えて溢れた内容は「次セクションの先頭ページの、見出しより上」に取り残される。
  この帯は**どのセクションにも属していなかった** — 自分のページ範囲外であり、かつ
  `trimToSectionStart` が次セクションの内容から捨てるため、丸ごと消えていた。

  ISO 32000-2 の実測: **412 セクション**が内容を落としており（段落 2055・note 248・表 174・
  リスト 112）、うち **271 が要件文（shall 等）を含んでいた**。表では Table 182 の
  `QuadPoints` 行、Table 166 の `CA`/`BM`/`Lang`、Table 171 の注釈型（7 → 28 行）などが該当する。

  `getSectionContent` が帯を回収することで `get_section` / `get_requirements` / `get_tables` が
  一度に是正された。**行が増えた表 92 件・減った表 0 件、要件が増えたセクション 364・減少 0。**

  採用規則は `trimToSectionStart` の正確な裏返し（同じ `findSectionHeadingIndex` で判定）とし、
  二重計上を構造的に不可能にしている。次セクションの見出しが検出できない 69 セクションでは、
  次セクション側が帯を保持しているためあえて採用しない。

  既知の限界: ヘッダ行を持たない表は連結条件（`headers.length > 0`）を満たさないため、
  帯として採用されても分裂する（5 セクション。8.7.4.5.5 は 2 → 4 表）。内容は
  `get_section` から見える。

- **stdout ガードを追加**（[#8](https://github.com/shuji-bonji/pdf-spec-mcp/issues/8) 項目 1・family 規約 §2.4）。
  MCP は stdout で JSON-RPC を喋るため、依存ライブラリが stdout へ書くとストリームが壊れる。
  Node では **`console.log` と `console.info` が stdout**、`warn` / `error` は stderr。
  pdfjs-dist v5 の実際の経路は `warn()` → `console.warn`（stderr・**stdout は汚さない**）、
  `info()` → `console.info`（stdout）、`deprecated()` → `console.log`（stdout）であり、
  `src/utils/stdout-guard.ts` は log / info / warn を stderr へ転送する。
  ESM の import 巻き上げにより、`index.ts` の**最初の import** である必要がある。

### Added

- **`list_specs` が「答えられない領域」を宣言するようになった**（S-2）。
  `search_spec("PDF/A conformance")` は 0 件を返すが、これは**「要件が無い」ではなく
  「コーパスに無いので答えられない」**であり、区別する手段が無かった。family 規約 §2.0 は
  writer / verify の実装判断をこのサーバの原文照合に通すと定めているため、この偽陰性が
  そのまま設計判断に流れ込む。`list_specs` の応答に `coverage`（未収録領域・該当規格・
  その帰結）を含めた。エージェントが最初に叩くツールなので、探索を始める前に限界が分かる。
  対象: **PDF/A（ISO 19005-1〜-4）** と **PAdES（ETSI EN 319 142）**。
  なおこれらは「ファイルが未配置」ではなく `SPEC_PATTERNS` にパターン自体が無いため、
  PDF を置いても認識されない（塞ぐにはパターン追加が要る）。PDF/UA（ISO 14289）は
  コーパスにあるので verify の該当規則は照合できる
- **表の中の要件を抽出する**。`extractRequirementsFromContent` は paragraph / list / note
  しか走査しておらず、**表のセルを完全に無視していた**。ISO の表は要件語の宝庫であり
  （「(Required) The type of annotation ... shall be Highlight ...」）、実測で
  **2739 件・333 セクション分**が `get_requirements` から見えていなかった。
  全体インデックスは **5927 → 8666 件（+46%）**。本文由来の 5927 件は不変。

  表は `collectStructTreeTables` で再構成してから走査するため、キャプションの帰属は
  `get_tables` と一致し、ページを跨いで分割された表も 1 つの表として扱われる。
  text 由来の表（`detectTablesFromText`）は走査しない — あれは paragraph から組み立てられており、
  本文の走査が既に読んでいるため二重計上になる。

- `Requirement` に **`source` / `table` / `key`** を追加（既存フィールドは不変・非破壊）。
  表から切り出した文は単体では「どのキーの制約か」が失われるため
  （「... shall be Highlight, Underline, ...」だけでは Table 182 の `Subtype` の話だと分からない）。
  `text` は引用できるよう原文のままとし、文脈を別フィールドで持つ。
  実測では**重複 31 グループのうち 24 が「文が同一でキーが異なる別々の要件」**だった
  （Table 51 の「A PDF reader shall implicitly reset this parameter」は `soft mask` と
  `alpha constant` の両方に掛かる）。`key` が無ければ片方が失われていた。

### Changed

- **Biome 2.5.4 へ移行**（[#8](https://github.com/shuji-bonji/pdf-spec-mcp/issues/8) 項目 2）。ESLint + Prettier を廃止。
  family 標準に合わせ **2.5.4 完全固定**（キャレット禁止。整形結果が minor で変わるため）。
  CI / publish workflow に `npm run check` と `npm run typecheck` を組み込んだ
- `collectStructTreeTables` を `services/table-collector.ts` へ切り出し、`get_tables` と
  `get_requirements` が「表とは何か」の規則を共有するようにした
- `DocumentLoaderService` が `DocumentSource` を注入できるようになった（既定は従来どおり）。
  ファイル読みと pdfjs 起動を差し替えられるので、LRU キャッシュを単体で検証できる

### Removed

- **未使用の `src/container.ts` を削除**（[#8](https://github.com/shuji-bonji/pdf-spec-mcp/issues/8) 項目 3）。
  `createServices()` はどこからも呼ばれておらず、実運用は `pdf-service.ts` のシングルトン（YAGNI）

### Internal

- ドキュメント LRU キャッシュ（エビクション順・`doc.destroy()`・アクセス順の更新）に
  実質的なテストが存在しなかった。e2e の「LRU キャッシュ」テストは `get_structure` 経由で、
  上位の section-index メモ（spec ごと・上限なし）しか測っておらず、LRU が完全に壊れていても
  緑のままだった。`pdf-loader.test.ts` にユニットテストを追加し、e2e 側は実態に即して改名した
- `npm run check:imports` を追加（biome を使わず import 順を検査する）

## [0.3.2] - 2026-07-14

### Changed

- Version bump only. 0.3.1 の publish 済みバージョンとの整合性を取るためのリリースで、パッケージ内容に変更はない

## [0.3.1] - 2026-07-14

### Added

- **Claude Code plugin 対応**: `.claude-plugin/plugin.json` を追加。Claude Code のプラグインとしてインストールすると `pdf-spec` MCP server (`npx -y @shuji-bonji/pdf-spec-mcp@latest`) が登録される。ISO 仕様 PDF の場所は従来どおり `PDF_SPEC_DIR` で指定する

### Documentation

- README / README.ja に PDF family (pdf-spec-mcp / [pdf-reader-mcp](https://github.com/shuji-bonji/pdf-reader-mcp) / [pdf-verify-mcp](https://github.com/shuji-bonji/pdf-verify-mcp)) の役割分担表を追加

## [0.3.0] - 2026-07-12

### Added

- **PDF 2.0 Errata Collection 3 (EC3) support**: `ISO_32000-2_sponsored_EC3.pdf` is now the primary spec (`iso32000-2`). EC3 (June 1, 2026) is a complete replacement for EC2 — 356 errata corrections (766 edits), 20 appended errata pages (1,020 → 1,023 pages). Updated ISO/TS 32001 and 32002 EC3 filenames (`*_sponsored_EC3.pdf`) are matched by the existing TS patterns
- **EC2 fallback pattern**: environments with only `ISO_32000-2_sponsored-ec2.pdf` still register `iso32000-2` with the correct "Errata Collection 2" title

### Changed

- **Pattern-priority spec discovery**: `discoverSpecs()` now processes files in `SPEC_PATTERNS` order instead of `readdir` order. When multiple files map to the same spec ID (e.g. EC3 and EC2 side by side), the earlier pattern wins — previously the winner silently depended on alphabetical filename order

### Documentation

- **README / README.ja**: updated file listing to EC3 filenames

## [0.2.4] - 2026-05-09

### Build

- **build script に `chmod +x dist/index.js` を追加**: local dev で `./dist/index.js` を直接実行した際の `permission denied` を回避。npm install / npx 経由の通常利用には影響なし (npm が install 時に bin を chmod するため)。shuji 製 MCP 全体で build script を統一。

## [0.2.3] - 2026-04-18

### Changed

- **Release pipeline: npm Trusted Publisher (OIDC) adoption**
  - `.github/workflows/publish.yml` now authenticates via OIDC (`id-token: write`) instead of `NPM_TOKEN`
  - Published packages now include signed provenance (`npm publish --provenance --access public`)
  - `NPM_TOKEN` secret is no longer used by this workflow (can be removed from repository secrets after Trusted Publisher is configured on npmjs.com)
  - Added a version-consistency check: the job fails if `package.json` version does not match the pushed `v*` tag
  - Enabled npm cache (`cache: 'npm'`) on `setup-node`

### Documentation

- **README**: Clarified installation — users normally don't need `npm install`; the MCP client launches `npx -y @shuji-bonji/pdf-spec-mcp` directly. Added a global-install option for reference
- **README**: Added `src/types/` to the directory structure
- Same updates applied to `README.ja.md`

## [0.2.2] - 2026-02-08

### Improved

- **README overhaul**: Added Mermaid architecture diagram, detailed per-tool usage examples with `jsonc`, and layer overview table
- **PDF file setup guide**: Prominent `[!IMPORTANT]` / `[!WARNING]` callouts at top of README with download links
- **Full file listing**: Complete tree of all 17 supported PDF filenames with spec IDs and descriptions
- **`spec` parameter documentation**: Clarified that all tools accept `spec` parameter (replacing the previously planned `get_ts_section`)
- **Bilingual**: All improvements applied to both `README.md` (EN) and `README.ja.md` (JA)

## [0.2.1] - 2026-02-08

### Added

- **CI workflow**: GitHub Actions CI with Node.js 20/22 matrix (lint, format check, build, test)
- **Publish workflow**: Automated npm publish on `v*` tag push

## [0.2.0] - 2026-02-07

### Added

- **Multi-spec support**: Auto-discovery of up to 17 PDF specification documents from `PDF_SPEC_DIR`
- **8 MCP tools**: `list_specs`, `get_structure`, `get_section`, `search_spec`, `get_requirements`, `get_definitions`, `get_tables`, `compare_versions`
- **E2E test suite**: 212 tests across 11 files covering all tools with multi-spec matrix testing
- **Unit test suite**: 237 tests across 13 files
- **Class-based service architecture**: `RegistryService`, `DocumentLoaderService`, `PDFSpecService`, `CompareService` with dependency injection
- **Service container**: `createServices()` factory for DI wiring
- **Error hierarchy**: `PDFSpecError` base class with `ValidationError`, `RegistryError`, `ContentError`, `ToolPrerequisiteError`
- **Bounded-concurrency processing**: `mapConcurrent()` utility for parallel page/section processing
- **Text utilities**: `stripZeroWidthChars()`, `normalizeTitle()` for PDF text normalization
- **LRU document cache**: Up to 4 concurrent PDF documents cached with automatic eviction
- **Version comparison**: Title-based automatic section matching between PDF 1.7 and 2.0
- **Multi-page table detection**: Header merging for tables spanning multiple pages
- **Configurable constants**: `VALIDATION_LIMITS`, `CONCURRENCY` in `config.ts`

### Supported Specifications

- ISO 32000-2:2020 (PDF 2.0) with Errata Collection 2
- ISO 32000-2:2020 (PDF 2.0) original
- ISO 32000-1:2008 (PDF 1.7)
- Adobe PDF Reference 1.7
- ISO/TS 32001–32005 (Hash, Digital Signatures, AES-GCM, Integrity, Namespace)
- ISO 14289-1 (PDF/UA-1), ISO 14289-2 (PDF/UA-2)
- Tagged PDF Best Practice Guide, Well-Tagged PDF, PDF Declarations
- PDF 2.0 Application Notes 001–003

## [0.1.0] - 2026-02-06

### Added

- Initial implementation with single-spec support (ISO 32000-2)
- Basic section extraction, search, requirements, and definitions
- Unit tests

[0.3.2]: https://github.com/shuji-bonji/pdf-spec-mcp/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/shuji-bonji/pdf-spec-mcp/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/shuji-bonji/pdf-spec-mcp/compare/v0.2.3...v0.3.0
[0.2.3]: https://github.com/shuji-bonji/pdf-spec-mcp/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/shuji-bonji/pdf-spec-mcp/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/shuji-bonji/pdf-spec-mcp/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/shuji-bonji/pdf-spec-mcp/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/shuji-bonji/pdf-spec-mcp/releases/tag/v0.1.0
