## ADDED Requirements

### Requirement: SPEC-PDFSPEC-COMMON-ERRORS-001 エラー応答の本文は family の平らな形にする

8 ツールのハンドラが返す失敗は、ツール結果の `isError: true` で返し、`content` の text を JSON のオブジェクトにする（SHALL）。最上位には `error`（英語の 1 文）・`code`・`retryable`（真偽値）を必ず書き、任意で `hint`・`next_actions`（`{ action, reason }` の配列）・`detail`（オブジェクト）を書く（SHALL）。最上位にこれ以外の項目を置かない（SHALL）。根拠は pdf-agent-stack `docs/specs/06` §2.3。

#### Scenario: 引数の誤りが形どおり

- **WHEN** `get_requirements` に `level: "definitely-not-a-level"` を渡す
- **THEN** `isError` が `true` で、本文の最上位は `error`・`code`・`retryable`・`hint`・`next_actions`・`detail` のどれかで、`error` は空でない文字列、`retryable` は真偽値

#### Scenario: 仕様書の置き場が無いエラーが形どおり

- **WHEN** `PDF_SPEC_DIR` を渡さずに `get_section` を呼ぶ
- **THEN** `code` は `REGISTRY_ERROR`、`retryable` は `false`、最上位に契約に無い項目が無い

### Requirement: SPEC-PDFSPEC-COMMON-ERRORS-002 引数の誤りは INVALID_ARGUMENT を返す

ハンドラが引数を拒むとき（引数の型・範囲の誤り、`level` の値の誤り）は、family の共通語彙の `code: "INVALID_ARGUMENT"` を返し、`retryable` を `true` にする（SHALL）。spec 固有のコードは `REGISTRY_ERROR`・`CONTENT_ERROR`・`PREREQUISITE_ERROR` だけで、共通語彙と同じ意味の別名（`VALIDATION_ERROR`）を `code` に返さない（SHALL）。

#### Scenario: 要件の水準の誤りは INVALID_ARGUMENT

- **WHEN** `get_requirements` に `level: "definitely-not-a-level"` を渡す
- **THEN** `code` は `INVALID_ARGUMENT`、`retryable` は `true`、`error` は受け付ける値を挙げている

#### Scenario: 引数の解析の失敗は INVALID_ARGUMENT

- **WHEN** ハンドラを直接呼び、スキーマに反する引数を渡す
- **THEN** 投げられたエラーの `code` は `INVALID_ARGUMENT`

### Requirement: SPEC-PDFSPEC-COMMON-ERRORS-003 retryable はすべてのエラーに書く

すべてのエラーの本文に `retryable` を真偽値で書く（SHALL）。`INVALID_ARGUMENT` は `true`、`PREREQUISITE_ERROR` と `INTERNAL_ERROR` は `false` にする（SHALL）。`REGISTRY_ERROR` と `CONTENT_ERROR` は、引数を直せば通るなら `true`、環境を直して起動し直す必要があるなら `false` にする（SHALL）。

#### Scenario: 故障にも retryable がある

- **WHEN** ハンドラの中で spec のエラーでない例外が投げられる
- **THEN** `code` は `INTERNAL_ERROR`、`retryable` は `false`

#### Scenario: 前提の不足は再試行できない

- **WHEN** `ToolPrerequisiteError` を本文に整形する
- **THEN** `code` は `PREREQUISITE_ERROR`、`retryable` は `false`

### Requirement: SPEC-PDFSPEC-COMMON-ERRORS-004 移行の版のあいだは旧い名前も返す

この要求を入れた minor のあいだは、`INVALID_ARGUMENT` の本文に `detail.legacyCode: "VALIDATION_ERROR"`（0.11.x で同じ状況に返していた `code`）を書く（SHALL）。名前の変わらないコードには `detail.legacyCode` を書かない（SHALL）。次の minor で外す（別の変更で REMOVED にする）。

#### Scenario: 引数の誤りの旧名

- **WHEN** `get_requirements` に `level: "definitely-not-a-level"` を渡す
- **THEN** `detail.legacyCode` は `VALIDATION_ERROR`

#### Scenario: 名前の変わらないコードに旧名は付かない

- **WHEN** `PDF_SPEC_DIR` を渡さずに `get_section` を呼ぶ
- **THEN** 本文に `detail` が無い
