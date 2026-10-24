---
spec_id: PDFSPEC
kind: tool
approved: 2026-10-25
pr: 26
---
# get-section

## Purpose

`get_section` ツールが返す節の内容（見出し・段落・リスト・表・注記の並び）と、その内容をどのページのどこで切ったかを定めます。
答えるのは「仕様のこの節に何が書いてあるか」を原文のまま並べることで、言い換えや要約はしません。

この初版は、2026-10-25 時点の既存テストが固定している振る舞いを起こしたもので、期待値は変えていません。
起こした範囲は次のテストです。

- `tests/e2e/04-get-section.test.ts` の C-1〜C-17
- `tests/e2e/13-boundary.test.ts` の B-1・B-2
- `src/services/content-extractor.test.ts` の `extractSectionContent`・`trimAfterNextSectionStart (S-9)`・`nested-P pages`（検索の区切りを見る 1 件を除く）
- `src/services/pdf-service.test.ts` の境界の帯（strip）・pageRange（S-10）・親の連結（SV-1）・boundary（#17）のうち `getSectionContent` を見るもの
- `src/tools/handlers.test.ts` の `get_section`

## できないこと

- 個々の PDF ファイルを読むこと（pdf-reader-mcp の仕事）
- 節の内容が規格に適合しているかを判定すること（pdf-verify-mcp の仕事）
- 構造木を持たない仕様 PDF で、段落より細かい要素（見出し・表）を作ること

## Requirements

### Requirement: SPEC-PDFSPEC-GET-SECTION-001 節番号で節を引き、番号・題・ページ範囲・内容を返す

`section` に節番号（`7.3.4`・`7`・`Annex A` など）を渡すと、応答は `sectionNumber`・`title`・`pageRange`（`start` と `end`、`start` ≤ `end`）・`content`（要素の配列）を返す（SHALL）。`spec` を省くと既定の仕様（ISO 32000-2）を引き、渡せばその仕様を引く（SHALL）。`Annex` の大文字と小文字は区別しない（SHALL）。

#### Scenario: 番号付きの節を引く
- **WHEN** iso32000-2 の `7.3.4` を引く
- **THEN** `sectionNumber` は `7.3.4`、`title` は空でなく、`pageRange.start` は 1 以上、`content` は 1 件以上

#### Scenario: Annex を小文字で引く
- **WHEN** iso32000-2 の `annex a` を引く
- **THEN** `sectionNumber` に `annex`（大文字小文字を問わない）が入る

#### Scenario: 末尾に点の付く番号の形式を持つ仕様を引く
- **WHEN** wtpdf の `1` を引く
- **THEN** `sectionNumber` は `1` で、`content` は 1 件以上

### Requirement: SPEC-PDFSPEC-GET-SECTION-002 無い節と空の節番号はエラーにする

`section` が空文字のとき、または指定した仕様に無い節番号のとき、内容を返さずエラーにする（SHALL）。無い節番号のエラーの文には `not found` を含める（SHALL）。

#### Scenario: 無い節番号
- **WHEN** iso32000-2 の `999.999` を引く
- **THEN** `not found` を含むエラーになる

#### Scenario: 空の節番号
- **WHEN** `section` に空文字を渡す
- **THEN** 空であることを述べるエラーになる

### Requirement: SPEC-PDFSPEC-GET-SECTION-003 構造木の役割から要素の種類を決める

構造木（ISO 32000-2 §14.7）のある仕様 PDF では、`H1`〜`H6` を `heading`（`level` は数字、`H` だけなら 3）、`P` を `paragraph`、`L` / `LI` を `list`、`Table`（`THead` / `TBody` を挟んでもよい）を `table`（`TH` の行を `headers`、`TD` の行を `rows`）にする（SHALL）。`NOTE` / `EXAMPLE`（番号付きを含む）で始まる段落は `note` とし、その語を `label`、残りを `text` にする（SHALL）。

#### Scenario: 見出しの役割
- **WHEN** `H1` と `H3` の要素を持つページを読む
- **THEN** `level` 1 と 3 の `heading` が文書順に並ぶ

#### Scenario: NOTE と EXAMPLE
- **WHEN** `NOTE 1 …` と `EXAMPLE …` で始まる `P` を読む
- **THEN** それぞれ `label` が `NOTE 1` と `EXAMPLE` の `note` になる

#### Scenario: 表を持つ実際の節
- **WHEN** iso32000-2 の `7.3.4.2` を引く
- **THEN** `content` に `table` の要素がある

### Requirement: SPEC-PDFSPEC-GET-SECTION-004 Artifact と空の段落は出さない

`Artifact`（ヘッダー・フッター・ページ番号）の文字は内容に入れない（SHALL）。空白だけの段落は要素にしない（SHALL）。

#### Scenario: Artifact の文字
- **WHEN** `Artifact` の `Page 42` と `P` の本文を持つページを読む
- **THEN** 要素は本文の `paragraph` 1 件だけ

#### Scenario: 空白だけの段落
- **WHEN** 空白だけの `P` と本文の `P` を持つページを読む
- **THEN** 要素は本文の 1 件だけ

### Requirement: SPEC-PDFSPEC-GET-SECTION-005 構造木の無いページは素のテキストを段落にする

構造木を持たないページは、ページの文字をつないだ 1 つの `paragraph` として返す（SHALL）。

#### Scenario: 構造木の無いページ
- **WHEN** 構造木が無く、文字が `Plain text content` と ` here.` のページを読む
- **THEN** `paragraph` 1 件で、`text` は `Plain text content here.`

#### Scenario: 構造木の無い仕様 PDF
- **WHEN** pdf17old の先頭の節を引く
- **THEN** `content` は 1 件以上

### Requirement: SPEC-PDFSPEC-GET-SECTION-006 ページをまたぐ内容を文書順につなぎ、入れ物の要素の中まで読む

節が複数ページにわたるときは、各ページの要素を文書順につなぐ（SHALL）。`Sect` / `Div` のような入れ物の要素は、その中の要素まで読む（SHALL）。

#### Scenario: 2 ページの内容
- **WHEN** 1 ページ目と 2 ページ目に段落が 1 つずつある範囲を読む
- **THEN** 2 件の `paragraph` がページ順に並ぶ

#### Scenario: 入れ子の入れ物
- **WHEN** `Sect > Div > P` の段落を読む
- **THEN** その段落が `paragraph` として出る

### Requirement: SPEC-PDFSPEC-GET-SECTION-007 先頭ページは自分の見出しから、次の節と共有する最終ページは次の見出しの手前まで

先頭ページでは自分の見出しより前の要素を捨てる（SHALL）。最終ページを次の節と共有するときは、次の節の見出し以降を捨てる（SHALL）。見出しの照合は節番号の前方一致にしない（`1.2` は `1.2.1` に当たらない）（SHALL）。Annex の子のようにキーが題まで含む節（`A.1 General`）は題まで一致させ、番号の後ろが改行でも当てる（SHALL）。次の見出しが見つからないときは、共有するページを丸ごと残す（SHALL）。

#### Scenario: 次の節の見出しで切る
- **WHEN** 最終ページを次の節と共有する節を読む
- **THEN** 次の節の見出しと、それ以降の要素は入らない

#### Scenario: 前方一致の兄弟で切らない
- **WHEN** 次の節が `1.2` で、ページに `1.2.1` の見出しがある
- **THEN** `1.2.1` の見出しでは切らない

#### Scenario: 実際の節で次の節を含まない
- **WHEN** iso32000-2 の `8.4.3.3` を引く
- **THEN** `8.4.3.4` で始まる見出しは入らない

### Requirement: SPEC-PDFSPEC-GET-SECTION-008 次の節の先頭ページにはみ出した末尾（帯）を回収し、二重に数えない

節の最後の内容が次の節の先頭ページの、次の見出しより上にはみ出しているとき（帯）、その帯を自分の内容の末尾に加える（SHALL）。次の節はその帯を含めない（SHALL）。次の節の見出しが継ぎ目のページに無いとき、見出しがページの先頭にあるとき、最後の節のときは何も加えない（SHALL）。

#### Scenario: 帯を回収する
- **WHEN** 次の節の先頭ページで、見出しより上に自分の続きがある
- **THEN** その続きが自分の内容の末尾に入る

#### Scenario: 帯を二重に数えない
- **WHEN** 帯を回収した節と、その次の節を引く
- **THEN** 次の節の内容に帯は入らない

#### Scenario: 継ぎ目のページに次の見出しが無い
- **WHEN** 次の節の見出しが継ぎ目のページで見つからない
- **THEN** 何も回収しない

### Requirement: SPEC-PDFSPEC-GET-SECTION-009 pageRange は回収した帯のページまで含める

帯を回収したときは `pageRange.end` を継ぎ目のページまで伸ばす（SHALL）。次の節が自分のページの先頭から始まるとき、2 つの節がページを共有するときは `pageRange.end` を伸ばさない（SHALL）。

#### Scenario: 帯の分だけ伸びる
- **WHEN** iso32000-2 の `14.9.4` を引く
- **THEN** `pageRange` は `{ start: 815, end: 816 }`

#### Scenario: はみ出しが無ければ伸びない
- **WHEN** 次の節が新しいページの先頭から始まる
- **THEN** `pageRange.end` は自分の最終ページのまま

### Requirement: SPEC-PDFSPEC-GET-SECTION-010 親の節は子孫を含む部分木全体を文書順に返す

子を持つ節は、自分の前文と全子孫の内容を文書順につないで返す（SHALL）。子孫の帯も含め（SHALL）、`pageRange` は部分木全体の範囲にする（SHALL）。つなぐのは互いに重ならない節ごとの片なので、同じ内容を 2 回入れない（SHALL）。

#### Scenario: 親が子の内容を含む
- **WHEN** iso32000-2 の `7.3.4` を引く
- **THEN** 最初の見出しは `7.3.4 String objects` で、`7.3.4.1` と `7.3.4.2` の見出しと、子にしか無い表の行が入る

#### Scenario: 子孫の表の規範が親から見える
- **WHEN** iso32000-2 の `12.8.2.2` を引く
- **THEN** `pageRange.start` は 588 で、表のセルに `shall not be considered as changes` がある

#### Scenario: 部分木のページ範囲
- **WHEN** 最後の子が次のページへはみ出す親を引く
- **THEN** `pageRange` は前文のページから、はみ出した先のページまで

### Requirement: SPEC-PDFSPEC-GET-SECTION-011 どこで切ったかを boundary で申告する

応答の `boundary` は `start` と `end` を持つ（SHALL）。`start` は自分の見出しが見つかれば `heading`、見つからなければ `page`（SHALL）。`end` は次の節の見出しで切れたら `heading`、次の節が後のページから始まるなら `page`、最終ページを共有する次の節の見出しが見つからなければ `page_shared`、継ぎ目のページに次の見出しが無ければ `next_page_unclaimed`、最後の節なら `document`（SHALL）。親の節は自分の `start` と最後の子孫の `end` を返す（SHALL）。

#### Scenario: 親で、はみ出しもある節
- **WHEN** iso32000-2 の `12.8.2.2` を引く
- **THEN** `boundary` は `{ start: 'heading', end: 'heading' }`、`pageRange` は `{ start: 588, end: 589 }`

#### Scenario: ページを共有する節
- **WHEN** pdf17 の `9.6.4` を引く
- **THEN** `boundary` は `{ start: 'heading', end: 'heading' }`

#### Scenario: 両端とも見出しが見つからない
- **WHEN** 見出しを 1 つも作れないページの節を引く
- **THEN** `boundary` は `{ start: 'page', end: 'page_shared' }`

### Requirement: SPEC-PDFSPEC-GET-SECTION-012 見出しは H の役割に限らず、P の入れ子と目次（outline）の項目からも作る

ブロック要素（`P` / `H*` / `L` / `Table` / `Sect` / `Div` など）を子孫に持つ `P` は入れ物として中を読み、ブロックの間にある裸の文字は段落として残す（SHALL）。`P` の本文が目次（outline）の項目と番号・題まで一致するときは `heading` にする（SHALL）。番号で始まるだけの段落は見出しにしない（SHALL）。`Table` の中の `Caption` は、表の直前の段落として出す（SHALL）。

#### Scenario: 見出しが P で入っている仕様
- **WHEN** pdf17 の `9.6.4` を引く
- **THEN** 最初の要素は `{ type: 'heading', level: 3, text: '9.6.4 Font Subsets' }` で、`9.6.3` の NOTE と `9.6.5` の内容は入らない

#### Scenario: P の入れ子の中の表
- **WHEN** pdf17 の `9.8.1` を引く
- **THEN** `table` の要素があり、表の行が段落の文字として入っていない

#### Scenario: 番号で始まるだけの段落
- **WHEN** 本文が節番号で始まるが、目次の題と一致しない `P` を読む
- **THEN** その段落は `heading` にならない
