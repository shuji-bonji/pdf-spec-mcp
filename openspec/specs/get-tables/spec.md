---
spec_id: PDFSPEC
kind: tool
approved: 2026-10-25
pr: 26
---
# get-tables

## Purpose

`get_tables` ツールが返す節の表（見出し行・本文の行・キャプション）と、ページをまたいで分かれた表を 1 つにつなぐ規則を定めます。
表の範囲は `get_section` と同じ切り方（SPEC-PDFSPEC-GET-SECTION-007〜010）で決まり、表のためだけの境界処理は持ちません。

この初版は、2026-10-25 時点の既存テストが固定している振る舞いを起こしたもので、期待値は変えていません。
起こした範囲は次のテストです。

- `tests/e2e/08-get-tables.test.ts` の T-1〜T-11
- `tests/e2e/13-boundary.test.ts` の B-3
- `src/services/table-collector.test.ts` の `collectStructTreeTables`
- `src/services/pdf-service.test.ts` のうち `getTables` を見るもの（帯の行の連結・次の節の表・親からの表・pageRange と boundary）
- `src/tools/handlers.test.ts` の `get_tables`

## できないこと

- 結合セル（行や列のまたがり）を復元すること
- 表の中身を規格に照らして判定すること（pdf-verify-mcp の仕事）
- 構造木を持たない仕様 PDF で、表を確実に見つけること（文字の並びから推定するか、0 件になる）

## Requirements

### Requirement: SPEC-PDFSPEC-GET-TABLES-001 節の表を返し、table_index で 1 つに絞る

`section` を渡すと、応答はその節（親なら部分木全体）の表を文書順に `tables` に並べ、件数を `totalTables` に入れる（SHALL）。各表は `headers`・`rows`・`caption` を持つ（SHALL）。`table_index`（0 始まり）を渡すとその表だけを返す（SHALL）。範囲外の `table_index` は `out of range` を含むエラー、負の `table_index`・空の `section` もエラーにする（SHALL）。表の無い節は `totalTables` 0 と空の `tables` を返す（SHALL）。

#### Scenario: 表のある節
- **WHEN** iso32000-2 の表を持つ節を引く
- **THEN** `tables` は 1 件以上で、見出し行と本文の行が分かれている

#### Scenario: 範囲外の table_index
- **WHEN** 表のある節に `table_index: 999` を渡す
- **THEN** `out of range` を含むエラーになる

#### Scenario: 表の無い節
- **WHEN** iso32000-2 の `7.2.2` を引く
- **THEN** `totalTables` は 0 で、`tables` は空

### Requirement: SPEC-PDFSPEC-GET-TABLES-002 ページをまたいで分かれた表を 1 つにつなぐ

次の 2 つのどちらかに当たる表の片は、直前の表の続きとしてつなぐ（SHALL）。(1) 見出し行が直前の表と同じ（ISO の表はページごとに見出し行を繰り返す。間に他の要素があってもつなぐ）。(2) キャプションが無く、直前に取り込んだ表のすぐ後にあり、見出し行が無いか全セル空白で、列数が直前の表と同じ。キャプションの段落を持つ表、段落を挟んだ見出し行の無い表、列数の違う表はつながない（SHALL）。帯として回収した行も同じ規則でつなぐ（SHALL）。

#### Scenario: 見出し行を繰り返す続き
- **WHEN** pdf17 の `9.8.1` を引く
- **THEN** Table 122 が 1 つの表で 22 行、見出し行は `['Key', 'Type', 'Value']`

#### Scenario: 段落を挟んだ見出し行の無い表
- **WHEN** 見出し行の無い表の間に段落がある
- **THEN** 2 つの表は別々のまま

#### Scenario: 見出し行の違う帯の表
- **WHEN** 帯として回収した表の見出し行が、直前の表と違う
- **THEN** つながずに別の表にする

### Requirement: SPEC-PDFSPEC-GET-TABLES-003 全セル空の行と見出し行は作らない

全セルが空の行は `rows` に入れない（SHALL。構造木に全セル空の `TR` は無い）。全セルが空の見出し行は `headers` にしない（SHALL）。ページの切り方でできた、文字を持たない片からは表を作らない（SHALL）。

#### Scenario: ページで輪切りにされた表
- **WHEN** iso32000-2 の `10.6.3` を引く
- **THEN** Table 126 は 1 つの表で 21 行、どの行にも空でないセルがある

#### Scenario: 文字を持たない片
- **WHEN** 全セルが空の片だけがある
- **THEN** 表を作らない

### Requirement: SPEC-PDFSPEC-GET-TABLES-004 表の直前のキャプションの段落を caption に入れる

表の直前の段落が表のキャプション（`Table 28 — …`、Annex の `Table F.5 …`・`Table A.1 — …`・`Table Annex O.3 …`）なら、その段落を `caption` に入れる（SHALL）。`Table` で始まるだけの文はキャプションにしない（SHALL）。キャプションが無い表は `caption` を `null` にし、作らない（SHALL）。キャプションの違う表は、見出し行が同じでもつながない（SHALL）。

#### Scenario: 番号のキャプション
- **WHEN** pdf17 の `7.7.2` を引く
- **THEN** 表は 1 つで、`caption` は `Table 28` で始まる

#### Scenario: Annex の英字付きキャプション
- **WHEN** pdf17 の `Annex F` を引く
- **THEN** Table F.1〜F.12 の 12 表で、`caption` はすべて `null` ではなく、行の合計は 88

#### Scenario: Table で始まるだけの文
- **WHEN** 表の直前の段落が `Table` で始まる普通の文
- **THEN** `caption` は `null`

### Requirement: SPEC-PDFSPEC-GET-TABLES-005 次の節の表を前の節に残さず、親からは子孫の表が見える

最終ページを次の節と共有するとき、次の節の表は前の節に入れない（SHALL）。次の節が持つ表をつなぎ先にしない（SHALL）。親の節は子孫の表を返す（SHALL）。

#### Scenario: 共有するページの次の節の表
- **WHEN** iso32000-2 の `8.4.3.3` を引く
- **THEN** Table 53 はあり、Table 54 は無い。Table 54 は `8.4.3.4` が 3 行で持つ

#### Scenario: 親から子孫の表
- **WHEN** 子にしか表が無い親を引く
- **THEN** `totalTables` は 1 以上で、子の表の行が入る

### Requirement: SPEC-PDFSPEC-GET-TABLES-006 何度呼んでも同じ表を返し、返した表を書き換えられても次の答えは変わらない

表を集める処理は、渡された内容を書き換えない（SHALL）。同じ節を何度引いても同じ表を返す（SHALL）。呼び出し側が返した `rows` やセルを書き換えても、次の呼び出しの答えは変わらない（SHALL。つないだ続きの行も写しを返す）。

#### Scenario: 繰り返し引く
- **WHEN** 同じ内容から表を 3 回集める
- **THEN** 3 回とも同じ結果になる

#### Scenario: 返した行を書き換える
- **WHEN** 返された表のセルを書き換えてから、もう一度集める
- **THEN** 2 回目の結果は書き換えの影響を受けない

### Requirement: SPEC-PDFSPEC-GET-TABLES-007 pageRange と boundary を付ける

応答は節の `pageRange` と `boundary`（SPEC-PDFSPEC-GET-SECTION-009・011 と同じ値）を持つ（SHALL）。`table_index` を渡しても同じ値を付ける（SHALL）。

#### Scenario: 実際の節の pageRange と boundary
- **WHEN** pdf17 の `9.8.1` を引く
- **THEN** `pageRange` は `{ start: 289, end: 291 }`、`boundary` は `{ start: 'heading', end: 'heading' }`

#### Scenario: ページで切れた節の 0 件
- **WHEN** ページの端で切れた節を引き、表が 0 件
- **THEN** `boundary` にページで切れたことが出る（「表が無い」とは言い切らない）

### Requirement: SPEC-PDFSPEC-GET-TABLES-008 扱い方を決めていない役割の要素の中にあるキャプションも caption に入れる

表の直前のキャプションが、SPEC-PDFSPEC-GET-SECTION-013 で段落にした文字（`P` ではない要素の直下の文字）であっても、SPEC-PDFSPEC-GET-TABLES-004 と同じ規則で `caption` に入れる（SHALL）。

#### Scenario: Div の直下のキャプション
- **WHEN** `Div` の直下にある `Table 323a - …` の文字の直後に表がある節を引く
- **THEN** その表の `caption` は `Table 323a` で始まる

#### Scenario: 実際の正誤表の節
- **WHEN** iso32000-2 の `Issue #156` を引く
- **THEN** 表は 1 つで、`caption` は `Table 323a` で始まる
