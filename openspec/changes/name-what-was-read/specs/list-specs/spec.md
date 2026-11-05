## ADDED Requirements

### Requirement: SPEC-PDFSPEC-LIST-SPECS-001 認識しなかったファイルの名前を返す

`list_specs` は、`PDF_SPEC_DIR` にある `.pdf` のファイルのうち、どの自動検出のパターンにも当たらなかったものの名前を `unrecognizedFiles`（名前の昇順の配列）で返す（SHALL）。当たらなかったファイルが無ければ `[]` を返す（SHALL）。置いた文書が読まれていないことに、利用者が応答から気づけるようにするためである。

#### Scenario: パターンに無い PDF がある

- **WHEN** `PDF_SPEC_DIR` に、パターンに当たる PDF とパターンに無い名前の PDF（`notes-2026.pdf`）を置いて `list_specs` を呼ぶ
- **THEN** `unrecognizedFiles` は `["notes-2026.pdf"]` で、`specs` に `notes-2026.pdf` が無い

#### Scenario: すべて認識した

- **WHEN** パターンに当たる PDF だけを置いて `list_specs` を呼ぶ
- **THEN** `unrecognizedFiles` は `[]`
