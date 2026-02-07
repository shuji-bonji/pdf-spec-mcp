# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.2.0]: https://github.com/shuji-bonji/pdf-spec-mcp/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/shuji-bonji/pdf-spec-mcp/releases/tag/v0.1.0
