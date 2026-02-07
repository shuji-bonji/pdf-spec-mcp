# PDF SPEC MCP Server

[日本語版 README はこちら](README.ja.md)

An MCP (Model Context Protocol) server that provides structured access to ISO 32000 (PDF) specification documents. Enables LLMs to navigate, search, and analyze PDF specifications through well-defined tools.

## Features

- **Multi-spec support** — Auto-discovers and manages up to 17 PDF-related documents (ISO 32000-2, PDF/UA, Tagged PDF guides, etc.)
- **Structured content extraction** — Headings, paragraphs, lists, tables, and notes from any section
- **Full-text search** — Keyword search with section-aware context snippets
- **Requirements extraction** — Extracts normative language (shall / must / may) per ISO conventions
- **Definitions lookup** — Term definitions from Section 3 (Definitions)
- **Table extraction** — Multi-page table detection with header merging
- **Version comparison** — Diff PDF 1.7 vs PDF 2.0 section structures
- **Bounded-concurrency processing** — Parallel page processing for large documents

## Available Tools

| Tool               | Description                                                       |
| ------------------ | ----------------------------------------------------------------- |
| `list_specs`       | List all discovered PDF specifications with metadata              |
| `get_structure`    | Get section hierarchy (table of contents) with configurable depth |
| `get_section`      | Get structured content of a specific section                      |
| `search_spec`      | Full-text keyword search across a specification                   |
| `get_requirements` | Extract normative requirements (shall/must/may)                   |
| `get_definitions`  | Lookup term definitions                                           |
| `get_tables`       | Extract table structures from a section                           |
| `compare_versions` | Compare PDF 1.7 and PDF 2.0 section structures                    |

## Supported Specifications

The server auto-discovers PDF files in `PDF_SPEC_DIR` by filename pattern matching:

| Category           | Spec IDs                                             | Documents                                               |
| ------------------ | ---------------------------------------------------- | ------------------------------------------------------- |
| **Standard**       | `iso32000-2`, `iso32000-2-2020`, `pdf17`, `pdf17old` | ISO 32000-2 (PDF 2.0), ISO 32000-1 (PDF 1.7)            |
| **Technical Spec** | `ts32001` – `ts32005`                                | Hash, Digital Signatures, AES-GCM, Integrity, Namespace |
| **PDF/UA**         | `pdfua1`, `pdfua2`                                   | Accessibility (ISO 14289-1, 14289-2)                    |
| **Guide**          | `tagged-bpg`, `wtpdf`, `declarations`                | Tagged PDF, Well-Tagged PDF, Declarations               |
| **App Note**       | `an001` – `an003`                                    | BPC, Associated Files, Object Metadata                  |

## Prerequisites

- Node.js >= 20.0.0
- PDF specification files (not included — obtain from [PDF Association](https://pdfa.org/sponsored-standards/))

## Installation

```bash
npm install @shuji-bonji/pdf-spec-mcp
```

Or run directly with npx:

```bash
PDF_SPEC_DIR=/path/to/pdf-specs npx @shuji-bonji/pdf-spec-mcp
```

## Configuration

### Environment Variable

| Variable       | Description                                  | Default    |
| -------------- | -------------------------------------------- | ---------- |
| `PDF_SPEC_DIR` | Directory containing PDF specification files | (required) |

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "pdf-spec": {
      "command": "npx",
      "args": ["-y", "@shuji-bonji/pdf-spec-mcp"],
      "env": {
        "PDF_SPEC_DIR": "/path/to/pdf-specs"
      }
    }
  }
}
```

### Cursor / VS Code

Add to `.cursor/mcp.json` or VS Code MCP settings:

```json
{
  "mcpServers": {
    "pdf-spec": {
      "command": "npx",
      "args": ["-y", "@shuji-bonji/pdf-spec-mcp"],
      "env": {
        "PDF_SPEC_DIR": "/path/to/pdf-specs"
      }
    }
  }
}
```

## Usage Examples

Once connected, your LLM can use tools like:

```
> list_specs
> get_structure { "max_depth": 2 }
> get_section { "section": "7.3.4" }
> search_spec { "query": "digital signature" }
> get_requirements { "section": "12.8", "level": "shall" }
> get_definitions { "term": "font" }
> get_tables { "section": "7.3.4" }
> compare_versions { "section": "12.8" }
```

## Architecture

```
src/
├── index.ts              # MCP server entry point
├── config.ts             # Configuration & spec patterns
├── errors.ts             # Error hierarchy (PDFSpecError → sub-classes)
├── container.ts          # Service container (DI wiring)
├── services/
│   ├── pdf-registry.ts       # Auto-discovery of PDF files
│   ├── pdf-loader.ts         # PDF loading with LRU cache
│   ├── pdf-service.ts        # Orchestration layer
│   ├── compare-service.ts    # Version comparison
│   ├── outline-resolver.ts   # Section index builder
│   ├── content-extractor.ts  # Structured content extraction
│   ├── search-index.ts       # Full-text search index
│   ├── requirement-extractor.ts
│   └── definition-extractor.ts
├── tools/
│   ├── definitions.ts    # MCP tool schemas
│   └── handlers.ts       # Tool implementations
└── utils/
    ├── concurrency.ts    # mapConcurrent (bounded Promise.all)
    ├── text.ts           # Text normalization
    ├── cache.ts          # LRU cache
    ├── validation.ts     # Input validation
    └── logger.ts         # Structured logger
```

## Development

```bash
git clone https://github.com/shuji-bonji/pdf-spec-mcp.git
cd pdf-spec-mcp
npm install
npm run build

# Unit tests (237 tests)
npm run test

# E2E tests (212 tests — requires PDF files in ./pdf-spec/)
npm run test:e2e

# Lint & format
npm run lint
npm run format:check
```

## License

[MIT](LICENSE)
