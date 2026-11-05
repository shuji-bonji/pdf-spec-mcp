---
spec_id: PDFSPEC
kind: common
introduced_by: family-error-contract
---
# common-errors Specification

## Purpose

8 ツールに共通する、失敗の返し方を定めます。ツール結果 `isError: true` の本文の形（PDF family の規約 pdf-agent-stack `docs/specs/06` §2.3）、引数の誤りに返す共通語彙の `code`（`INVALID_ARGUMENT`）と、spec 固有のコード（`REGISTRY_ERROR`・`CONTENT_ERROR`・`PREREQUISITE_ERROR`）、すべてのエラーに `retryable` を書くこと、移行の版のあいだ旧い名前（`VALIDATION_ERROR`）も返すことを扱います。
受け側の Skill は `code` で分岐し、`retryable` で再試行してよいかを決めます。`REGISTRY_ERROR` は起きた箇所によって `retryable` の値が違うので、`code` だけでは決められません。SDK がハンドラより前に拒む入力検証の失敗は、この capability の対象外です（§2.11）。

## Requirements

### Requirement: SPEC-PDFSPEC-COMMON-ERRORS-001 エラー応答の本文は family の平らな形にする

8 ツールのハンドラが返す失敗は、ツール結果の `isError: true` で返し、`content` の text を JSON のオブジェクトにする（SHALL）。最上位には `error`（英語の 1 文）・`code`・`retryable`（真偽値）を必ず書き、任意で `hint`・`next_actions`（`{ action, reason }` の配列）・`detail`（オブジェクト）を書く（SHALL）。最上位にこれ以外の項目を置かない（SHALL）。根拠は pdf-agent-stack `docs/specs/06` §2.3。

#### Scenario: 引数の誤りが形どおり

- **WHEN** `get_requirements` に `level: "definitely-not-a-level"` を渡す
- **THEN** `isError` が `true` で、本文の最上位は `error`・`code`・`retryable`・`hint`・`next_actions`・`detail` のどれかで、`error` は空でない文字列、`retryable` は真偽値

#### Scenario: 仕様書の置き場が無いエラーが形どおり

- **WHEN** `PDF_SPEC_DIR` を渡さずに `get_section` を呼ぶ
- **THEN** `code` は `REGISTRY_ERROR`、`retryable` は `false`、最上位に契約に無い項目が無い

### Requirement: SPEC-PDFSPEC-COMMON-ERRORS-002 引数の誤りは INVALID_ARGUMENT を返す

ハンドラが引数を拒むとき（引数の型・範囲の誤り、`level` の値の誤り、知らない `spec` の id、引数で指した節・表が無い、指した仕様ではそのツールが働かない）は、family の共通語彙の `code: "INVALID_ARGUMENT"` を返し、`retryable` を `true` にする（SHALL）。spec 固有のコードは `REGISTRY_ERROR`・`CONTENT_ERROR`・`PREREQUISITE_ERROR` だけで、共通語彙と同じ意味の別名（`VALIDATION_ERROR`）を `code` に返さない（SHALL）。0.12.x が移行のために置いていた `detail.legacyCode` も書かない（SHALL）。

#### Scenario: 要件の水準の誤りは INVALID_ARGUMENT

- **WHEN** `get_requirements` に `level: "definitely-not-a-level"` を渡す
- **THEN** `code` は `INVALID_ARGUMENT`、`retryable` は `true`、`error` は受け付ける値を挙げている

#### Scenario: 引数の解析の失敗は INVALID_ARGUMENT

- **WHEN** ハンドラを直接呼び、スキーマに反する引数を渡す
- **THEN** 投げられたエラーの `code` は `INVALID_ARGUMENT`

#### Scenario: 移行の版の旧い名前を返さない

- **WHEN** `get_requirements` に `level: "definitely-not-a-level"` を渡す
- **THEN** 本文に `detail.legacyCode` が無い

#### Scenario: 知らない spec の id は INVALID_ARGUMENT

- **WHEN** 登録されていない `spec` の id で `getSpecPath`・`resolveSpecId` を呼ぶ
- **THEN** `code` は `INVALID_ARGUMENT`、`retryable` は `true`、`next_actions[0].action` は `list_specs` の案内

#### Scenario: 指した節が無いのは INVALID_ARGUMENT

- **WHEN** 仕様に無い節の番号で `get_section` を呼ぶ
- **THEN** `code` は `INVALID_ARGUMENT`、`retryable` は `true`

### Requirement: SPEC-PDFSPEC-COMMON-ERRORS-003 retryable はすべてのエラーに書く

すべてのエラーの本文に `retryable` を真偽値で書き、値は `code` ごとに 1 つに決める（SHALL）。`INVALID_ARGUMENT` は `true`、`REGISTRY_ERROR`・`CONTENT_ERROR`・`PREREQUISITE_ERROR`・`INTERNAL_ERROR` は `false` にする（SHALL）。エラーを作る箇所で値を選ばない（SHALL）。同じ `code` に 2 つの値があると、受け側は `code` で再試行を決められないためである。reader・writer・verify と同じ決め方（「同じ処理が引数を変えれば成功しうるか」）にする。

#### Scenario: 故障にも retryable がある

- **WHEN** ハンドラの中で spec のエラーでない例外が投げられる
- **THEN** `code` は `INTERNAL_ERROR`、`retryable` は `false`

#### Scenario: 前提の不足は再試行できない

- **WHEN** `ToolPrerequisiteError` を本文に整形する
- **THEN** `code` は `PREREQUISITE_ERROR`、`retryable` は `false`

#### Scenario: REGISTRY_ERROR と CONTENT_ERROR は常に再試行できない

- **WHEN** `RegistryError` と `ContentError` を作る
- **THEN** どちらも `retryable` は `false`（作る箇所から値を渡せない）
