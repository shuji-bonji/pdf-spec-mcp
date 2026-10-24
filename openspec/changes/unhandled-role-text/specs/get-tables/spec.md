# get-tables（差分）

## ADDED Requirements

### Requirement: SPEC-PDFSPEC-GET-TABLES-008 扱い方を決めていない役割の要素の中にあるキャプションも caption に入れる

表の直前のキャプションが、SPEC-PDFSPEC-GET-SECTION-013 で段落にした文字（`P` ではない要素の直下の文字）であっても、SPEC-PDFSPEC-GET-TABLES-004 と同じ規則で `caption` に入れる（SHALL）。

#### Scenario: Div の直下のキャプション
- **WHEN** `Div` の直下にある `Table 323a - …` の文字の直後に表がある節を引く
- **THEN** その表の `caption` は `Table 323a` で始まる

#### Scenario: 実際の正誤表の節
- **WHEN** iso32000-2 の `Issue #156` を引く
- **THEN** 表は 1 つで、`caption` は `Table 323a` で始まる
