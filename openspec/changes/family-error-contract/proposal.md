---
approved: 2026-11-05
pr: 34
implementation: required
targets: [common-errors]
---

# Proposal

## Why

PDF family のエラー応答の規約（pdf-agent-stack `docs/specs/06` §2.3。2026-11-04 改訂、pdf-agent-stack#48）は、ツール結果の本文を平らな JSON（`error` 英語の文・`code`・`retryable` が必須、`hint`・`next_actions`・`detail` が任意）にし、同じ状況には同じ `code`（houki-hub family の共通語彙）を返すと定めました。spec はすでにこの平らな形を返していて、ずれているのは次の 2 点です（pdf-spec-mcp#33）。

| 点 | 0.11.0 | 規約 |
| --- | --- | --- |
| 引数の誤りの `code` | `VALIDATION_ERROR` | 共通語彙の `INVALID_ARGUMENT` |
| `retryable` | 型（`SpecServiceError`）では任意。ハンドラの外で起きた故障（`INTERNAL_ERROR`）には付かない | 常に書く |

ハンドラがエラーを作る箇所 13 か所は、どれもすでに `retryable` を持っています（`ValidationError` と `ToolPrerequisiteError` は既定値、`RegistryError` と `ContentError` は作る箇所で指定）。抜けるのは `INTERNAL_ERROR` の経路だけで、型が任意なので、次に足すエラーで抜けても気づけません。

エラーの振る舞いを固定している仕様はまだありません。8 ツールに共通する振る舞いなので、共通の capability `common-errors`（`kind: common`）として初版を起こします。

## What Changes

- 引数の誤り（`parseArgs` の失敗と、`level` の値の誤り）の `code` を `INVALID_ARGUMENT` にする。
- `retryable` を `SpecServiceError` の型で必須にし、`INTERNAL_ERROR` には `false` を書く。`RegistryError` と `ContentError` は、作る箇所で `retryable` を指定しないとコンパイルが通らないようにする。
- 移行の版（この変更を入れる minor）のあいだは、`INVALID_ARGUMENT` に `detail.legacyCode: "VALIDATION_ERROR"` を書く（#48 で決定）。spec の応答に `detail` はまだ無いので、`detail` を足す。

### 変わる振る舞い

- 引数の誤りの `code` が `VALIDATION_ERROR` から `INVALID_ARGUMENT` に変わり、`detail.legacyCode` が加わる。
- `INTERNAL_ERROR` の本文に `retryable: false` が加わる。

### 変わらない振る舞い

- 成功したときの出力（8 ツールとも）と `tools/list`。
- どの入力がエラーになるか。エラーの文（`error`）・`hint`・`next_actions` の値。
- `REGISTRY_ERROR`・`CONTENT_ERROR`・`PREREQUISITE_ERROR` の名前と、それぞれの `retryable` の値。共通語彙に当たらない spec 固有のコードとして残す。
- SDK が前段で落とす入力検証の失敗（宣言に無いキーなど）は、SDK の文言のまま返す（§2.11。2026-08-27 決定、#48 で再確認）。

### 対象外

- `detail.legacyCode` を外すこと。その次の minor で別の変更として出す。
- `REGISTRY_ERROR` と `CONTENT_ERROR` の中身を共通語彙に分け直すこと（たとえば「仕様 ID が無い」を `INVALID_ARGUMENT` にする）。今の 2 つは「どこで起きたか」で分けていて、同じコードに `retryable` の `true` と `false` が混ざっている（design.md）。分け直すなら別の Issue で決める。
- pdf-publish Skill と pdf-agent-stack のサイトの error-codes の書き直し（#48 で追う）。

## Capabilities

- `common-errors`（新規。`kind: common`。ADDED: 001〜004）

## 人が判断すること

- 版。`code` の値が変わるので minor（0.12.0）を提案します。`detail.legacyCode` を外すのは 0.13.0。
- `REGISTRY_ERROR` と `CONTENT_ERROR` の `retryable` を、コードごとに 1 つの値にそろえないこと（verify 0.33.0 はそろえた。design.md の表）。
