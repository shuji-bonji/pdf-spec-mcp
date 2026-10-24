# get-section（差分）

## ADDED Requirements

### Requirement: SPEC-PDFSPEC-GET-SECTION-013 扱い方を決めていない役割の要素の直下にある文字も、その位置の段落として出す

見出し・段落・リスト・表・`Code`・`Artifact` のどれにも当たらない役割の要素（`Sect` / `Div` / `TOC` / `TOCI` / `Link` / `Span` / `Caption` / `Figure` など）は、直下にある文字（ISO 32000-2 §14.7.5.1 の content item）を捨てずに段落にする（SHALL）。ブロック要素の子はこれまでどおり要素として読み（SHALL）、その間にある文字と、インラインの子（`Span` / `Link` など）の文字は、ひと続きごとに 1 つの段落にまとめる（SHALL）。`Figure` の中の文字も同じ扱いにする（SHALL。ISO 32000-2 §14.8.4.8.5 Table 373 は、Figure の中の文字を図の一部としている）。直下の `Artifact` の文字は出さない（SHALL）。できた段落には、ほかの段落と同じ規則（SPEC-PDFSPEC-GET-SECTION-003 の NOTE / EXAMPLE、012 の目次との照合）を当てる（SHALL）。

#### Scenario: 目次の項目の文字が段落になる
- **WHEN** `TOC > TOCI` の直下に文字だけがあるページを読む
- **THEN** その文字が `paragraph` として出る

#### Scenario: 図の中の文字が図のキャプションの直前に段落として出る
- **WHEN** `Div` の中に、文字を持つ `Figure` と、`Figure 1 — …` の `P` が並ぶページを読む
- **THEN** 図の文字の `paragraph` があり、その直後にキャプションの `paragraph` がある

#### Scenario: 入れ物の直下の文字とブロック要素が文書順に並ぶ
- **WHEN** `Sect` の直下に、文字、`P`、文字の順で子があるページを読む
- **THEN** `paragraph` が 3 つ、その順で出る

#### Scenario: 入れ物の中の Artifact は出さない
- **WHEN** `Div` の直下に `Artifact` の文字と本文の文字があるページを読む
- **THEN** 本文の文字だけが `paragraph` として出る

#### Scenario: 実際の目次の節が空でない
- **WHEN** iso32000-2 の `Contents` を引く
- **THEN** `content` は 1 件以上

#### Scenario: 実際の節で図の文字が入る
- **WHEN** iso32000-2 の `12.5.6.6` を引く
- **THEN** `Free text with callouts` を含む `paragraph` が、`Figure 79` で始まる段落の直前にある
