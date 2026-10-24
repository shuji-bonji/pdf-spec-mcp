---
spec_id: PDFSPEC
kind: tool
approved: 2026-10-25
pr: 26
---
# get-requirements

## Purpose

`get_requirements` ツールが返す規範の文（shall / shall not / should / should not / may を含む文）と、その文がどの節・どの表のどの行にあったかを定めます。
文は原文のまま返し、言い換えません。拾う範囲は `get_section` と同じ切り方（SPEC-PDFSPEC-GET-SECTION-007〜010）で決まります。

この初版は、2026-10-25 時点の既存テストが固定している振る舞いを起こしたもので、期待値は変えていません。
起こした範囲は次のテストです。

- `tests/e2e/06-get-requirements.test.ts` の RQ-1〜RQ-12
- `tests/e2e/13-boundary.test.ts` の B-4〜B-6
- `src/services/requirement-extractor.test.ts` の `extractSentence`・`extractRequirementsFromContent`・`extractRequirementsFromContent — tables`
- `src/services/pdf-service.test.ts` のうち `getRequirements` を見るもの（親と全走査の二重計上・帯の要件・sectionsCutByPage）
- `src/tools/handlers.test.ts` の `get_requirements`

索引のディスクキャッシュ（`src/services/index-store.test.ts`、`pdf-service.test.ts` の PS-C1〜C4）はこの初版に入れていません。

## できないこと

- 規範の文の意味を解釈して、満たしているかを判定すること（pdf-verify-mcp の仕事）
- 規範の語を含まない文を、文脈から要求とみなすこと
- 構造木から作った表以外（文字の並びから推定した表）のセルを、表の要件として拾うこと（本文の走査と二重に数えるため）

## Requirements

### Requirement: SPEC-PDFSPEC-GET-REQUIREMENTS-001 規範の語を含む文を、語の強さ（level）付きで拾う

段落・リスト・注記・構造木の表のセルから、`shall` / `shall not` / `should` / `should not` / `may` を含む文を 1 文ずつ拾い、`level` にその語を入れる（SHALL）。語の大文字と小文字は区別しない（SHALL）。小数点（`1.5` など）では文を切らない（SHALL）。同じ文を同じ場所で 2 回拾わない（SHALL）。各要件は `text`（原文の文）・`section`・`sectionTitle` を持つ（SHALL）。

#### Scenario: 段落の shall
- **WHEN** `7.3 Objects` の段落に `The value shall be a positive integer.` がある
- **THEN** `level` は `shall`、`text` はその文、`section` は `7.3`、`sectionTitle` は `Objects`

#### Scenario: 1 つの段落に 2 文
- **WHEN** 規範の文を 2 つ含む段落を読む
- **THEN** 要件は 2 件

#### Scenario: 規範の語が無い
- **WHEN** 規範の語を含まない内容を読む
- **THEN** 要件は 0 件

### Requirement: SPEC-PDFSPEC-GET-REQUIREMENTS-002 要件の ID は節ごとの連番で、一意

各要件の `id` は `R-<節>-<連番>` の形で（SHALL）、1 回の応答の中で重複しない（SHALL）。

#### Scenario: 連番
- **WHEN** `7.6` の段落から 2 件拾う
- **THEN** `id` は `R-7.6-1` と `R-7.6-2`

#### Scenario: 実際の節で一意
- **WHEN** iso32000-2 の `12.8` を引く
- **THEN** すべての `id` が互いに異なる

### Requirement: SPEC-PDFSPEC-GET-REQUIREMENTS-003 section と level で絞り込み、件数の内訳を返す

`section` を渡すとその節（親なら部分木全体）に、`level` を渡すとその語の要件に絞る（SHALL。両方なら両方を満たすもの）。応答の `filter` は渡した値を、省いたほうは `all` を返す（SHALL）。`statistics` は `level` ごとの件数で、合計は `totalRequirements` と等しい（SHALL）。`level` が 5 つの語のどれでもないとき、`section` が空文字のときはエラーにする（SHALL。`level` のエラーの文には `Invalid requirement level` を含める）。

#### Scenario: level で絞る
- **WHEN** iso32000-2 の `12.8` を `level: 'shall not'` で引く
- **THEN** すべての要件の `level` が `shall not`

#### Scenario: 内訳の合計
- **WHEN** iso32000-2 の `12.8` を引く
- **THEN** `statistics` の値の合計は `totalRequirements`

#### Scenario: 無効な level
- **WHEN** `level: 'invalid'` を渡す
- **THEN** `Invalid requirement level` を含むエラーになる

### Requirement: SPEC-PDFSPEC-GET-REQUIREMENTS-004 表のセルから拾った要件には、表と行の手がかりを付ける

構造木の表のセルから拾った要件は `source: 'table'` を持ち（SHALL）、表にキャプションがあれば `table` にキャプションを（SHALL）、`key` にその行の先頭のセルを入れる（SHALL）。キャプションが無い表では `table` を付けず、作らない（SHALL）。本文から拾った要件には `source`・`table`・`key` を付けない（SHALL）。同じ文が別の行（別のキー）にあれば、行ごとに別の要件にする（SHALL）。続きの片の行は、つないだ先の表の要件にする（SHALL）。キャプションの段落そのものが規範の文なら本文として 1 回だけ数える（SHALL）。

#### Scenario: 表のセルの要件
- **WHEN** キャプション付きの表の行に規範の文がある
- **THEN** `source` は `table`、`table` はキャプション、`key` はその行の先頭のセル

#### Scenario: 同じ文を持つ 2 つの行
- **WHEN** 2 つの行（`soft mask` と `alpha constant`）が同じ規範の文を持つ
- **THEN** 要件は 2 件で、`key` がそれぞれの行になる

#### Scenario: キャプションの無い表
- **WHEN** キャプションの無い表のセルに規範の文がある
- **THEN** `source` は `table`、`key` は行の先頭のセルで、`table` は付かない

### Requirement: SPEC-PDFSPEC-GET-REQUIREMENTS-005 親の節も全走査も、同じ文を 2 回数えない

親の節の要件は、互いに重ならない節ごとの片から拾うので、子孫の文を祖先の数だけ数えない（SHALL）。`section` を省いた全走査は、各節の自分の片だけから拾う（SHALL）。見出しで切れた節は、隣の節の文を含めない（SHALL）。

#### Scenario: 親と子で 1 回ずつ
- **WHEN** 子の表にある規範の文を、子と親で引く
- **THEN** どちらでもその文は 1 件

#### Scenario: 見出しが P で入っている仕様の節
- **WHEN** pdf17 の `9.6.4` を `level: 'shall'` で引く
- **THEN** 2 件で、どちらも `section` は `9.6.4`

#### Scenario: Annex の子を親から引く
- **WHEN** pdf17 の `Annex C` を `level: 'shall'` で引く
- **THEN** 1 件で、`section` は `C.2 Architectural limits`

### Requirement: SPEC-PDFSPEC-GET-REQUIREMENTS-006 次の節の先頭ページへはみ出した文も拾う

SPEC-PDFSPEC-GET-SECTION-008 で回収した帯の中の規範の文も、はみ出した元の節の要件として拾う（SHALL）。

#### Scenario: 帯の中の規範の文
- **WHEN** 次の節の先頭ページの、見出しより上に規範の文がはみ出している
- **THEN** その文は元の節の要件に入る

### Requirement: SPEC-PDFSPEC-GET-REQUIREMENTS-007 ページで切れた節を sectionsCutByPage に並べる

応答の `sectionsCutByPage` は、対象の範囲のうち `boundary`（SPEC-PDFSPEC-GET-SECTION-011）の `start` が `page`、または `end` が `page_shared` / `next_page_unclaimed` の節を、`section` と `boundary` の組で並べる（SHALL）。そういう節が無ければ空の配列（SHALL）。全走査でも、節を指定したときと同じ判定で並べる（SHALL）。

#### Scenario: ページで切れた節が無い
- **WHEN** pdf17 の `9.6` を引く
- **THEN** `sectionsCutByPage` は空の配列

#### Scenario: pdf17 の全走査
- **WHEN** pdf17 を `section` なしで引く
- **THEN** `sectionsCutByPage` は 11 件で、すべて `[` で始まる参考文献の項目

#### Scenario: iso32000-2 の全走査
- **WHEN** iso32000-2 を `section` なしで引く
- **THEN** `sectionsCutByPage` は 12 件で、7〜14 とその子孫の節は 1 つも含まない
