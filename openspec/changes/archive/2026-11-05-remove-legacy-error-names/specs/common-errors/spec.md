## MODIFIED Requirements

### Requirement: SPEC-PDFSPEC-COMMON-ERRORS-002 引数の誤りは INVALID_ARGUMENT を返す

ハンドラが引数を拒むとき（引数の型・範囲の誤り、`level` の値の誤り）は、family の共通語彙の `code: "INVALID_ARGUMENT"` を返し、`retryable` を `true` にする（SHALL）。spec 固有のコードは `REGISTRY_ERROR`・`CONTENT_ERROR`・`PREREQUISITE_ERROR` だけで、共通語彙と同じ意味の別名（`VALIDATION_ERROR`）を `code` に返さない（SHALL）。0.12.x が移行のために置いていた `detail.legacyCode` も書かない（SHALL）。

#### Scenario: 要件の水準の誤りは INVALID_ARGUMENT

- **WHEN** `get_requirements` に `level: "definitely-not-a-level"` を渡す
- **THEN** `code` は `INVALID_ARGUMENT`、`retryable` は `true`、`error` は受け付ける値を挙げている

#### Scenario: 引数の解析の失敗は INVALID_ARGUMENT

- **WHEN** ハンドラを直接呼び、スキーマに反する引数を渡す
- **THEN** 投げられたエラーの `code` は `INVALID_ARGUMENT`

#### Scenario: 移行の版の旧い名前を返さない

- **WHEN** `get_requirements` に `level: "definitely-not-a-level"` を渡す
- **THEN** 本文に `detail.legacyCode` が無い

## REMOVED Requirements

### Requirement: SPEC-PDFSPEC-COMMON-ERRORS-004 移行の版のあいだは旧い名前も返す

**Reason**: 移行の版（0.12.x）のためだけの要求で、0.13.0 で外すと 2026-11-04 に決めていた。`VALIDATION_ERROR` で分岐する受け側は見つかっていない。

**Migration**: `detail.legacyCode` の代わりに `code` を読む。`VALIDATION_ERROR` は `INVALID_ARGUMENT` になった。
