# common-output Specification

## Purpose
TBD - created by archiving change name-what-was-read. Update Purpose after archive.

## Requirements

### Requirement: SPEC-PDFSPEC-COMMON-OUTPUT-001 応答に、使った仕様の id を返す

`spec` 引数を取る 6 ツール（`get_structure`・`get_section`・`search_spec`・`get_requirements`・`get_definitions`・`get_tables`）の成功の応答は、最初の項目 `spec` に、読んだ仕様の id を返す（SHALL）。`spec` を省いたときは既定の id を返す（SHALL）。`compare_versions` は、比べた 2 つの仕様の id を `specs` で返す（SHALL）。同じ呼び出しでも既定の仕様が環境によって変わりうるので、応答だけからどの文書の答えかを読めるようにするためである。

#### Scenario: spec を省いた search_spec

- **WHEN** `spec` を渡さずに `search_spec` を呼ぶ
- **THEN** 応答の最初の項目は `spec` で、値は `iso32000-2`

#### Scenario: spec を渡した get_section

- **WHEN** `spec: "pdf17"` で `get_section` を呼ぶ
- **THEN** 応答の `spec` は `pdf17`

#### Scenario: compare_versions は 2 つの id を返す

- **WHEN** `compare_versions` を呼ぶ
- **THEN** 応答の `specs` は `["pdf17", "iso32000-2"]`
