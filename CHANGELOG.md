# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
