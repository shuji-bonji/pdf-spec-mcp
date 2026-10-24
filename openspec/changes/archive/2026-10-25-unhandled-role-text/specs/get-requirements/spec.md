# get-requirements（差分）

## ADDED Requirements

### Requirement: SPEC-PDFSPEC-GET-REQUIREMENTS-008 キャプションが入れ物の中にある表の要件にも table を付ける

SPEC-PDFSPEC-GET-TABLES-008 でキャプションが取れた表のセルから拾った要件にも、SPEC-PDFSPEC-GET-REQUIREMENTS-004 と同じ規則で `table`（キャプション）と `key` を付ける（SHALL）。要件の件数は変えない（SHALL。キャプションの段落に規範の語が無ければ、増えるのは `table` の値だけ）。

#### Scenario: Div の直下のキャプションを持つ表の要件
- **WHEN** `Div` の直下にある `Table 323a - …` の文字の直後の表に、規範の文を持つ行がある節を引く
- **THEN** その要件の `source` は `table`、`table` は `Table 323a` で始まる

#### Scenario: 実際の正誤表の節
- **WHEN** iso32000-2 の `Issue #156` を引く
- **THEN** 要件は 5 件で、5 件とも `table` が `Table 323a` で始まる
