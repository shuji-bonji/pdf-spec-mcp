---
approved:
pr:
implementation: required
targets: [common-errors]
---

# Proposal

## Why

0.12.0（変更 `family-error-contract`、#33）は、引数の誤りの `code` を `VALIDATION_ERROR` から PDF family の共通語彙の `INVALID_ARGUMENT` に変え、移行の版として 1 つの minor のあいだだけ旧い名前を `detail.legacyCode: "VALIDATION_ERROR"` に残すと決めました（SPEC-PDFSPEC-COMMON-ERRORS-004。pdf-agent-stack `docs/specs/06` §2.3 の「移行」、2026-11-04 決定）。その minor が 0.12.x で、次の minor（0.13.0）で外すことになっています。

`VALIDATION_ERROR` で分岐している受け側は見つかっていません（2026-11-05 に pdf-trust・pdf-publish・pdf-read の Skill、サイト、pdf-agent-stack の S6 を確認）。pdf-verify-mcp も同じ日に旧名を外します（verify#37、0.34.0 の予定）。

## What Changes

- `INVALID_ARGUMENT` の本文から `detail.legacyCode` を外す。spec のエラーで `detail` を書くものはほかに無いので、本文から `detail` が無くなる。
- 型 `ErrorDetail` から `legacyCode` を外す。

### 変わる振る舞い

- `INVALID_ARGUMENT` の本文から `detail`（`{ legacyCode: "VALIDATION_ERROR" }`）が無くなる。

### 変わらない振る舞い

- `error`・`code`・`retryable`・`hint`・`next_actions`。どの入力がどの `code` になるか。
- `retryable` の決め方。`REGISTRY_ERROR` と `CONTENT_ERROR` は、引数を直せば通るなら `true`、環境を直す必要があるなら `false` で、投げる箇所によって値が変わる（SPEC-PDFSPEC-COMMON-ERRORS-003）。reader・writer・verify は `code` ごとに値を 1 つに決めているが、spec の 003 は箇所ごとに決めると定めているので、この変更では変えない。
- 成功したときの出力。

### 対象外

- 正本 `common-errors` の Purpose は「移行の版のあいだ旧い名前（`VALIDATION_ERROR`）も返すこと」に触れているが、OpenSpec の差分は Purpose を書き換えない。archive の後に人が直すか、そのまま残すかを決める。

## Capabilities

- `common-errors`（MODIFIED: 002。REMOVED: 004）

## 人が判断すること

- 版。応答の項目が減る破壊的変更だが、0.x の minor（0.13.0）で外すことは 2026-11-04 に決めている。
