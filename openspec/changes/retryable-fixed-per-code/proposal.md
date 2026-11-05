---
approved: 2026-11-06
pr: 36
implementation: required
targets: [common-errors]
---

# Proposal

## Why

いまの spec は、同じ `code` でも起きた箇所によって `retryable` の値が違います。`REGISTRY_ERROR` は、フォルダーの問題（`PDF_SPEC_DIR` が無い・展開されていない・読めない）なら `false`、知らない `spec` の id なら `true` です。`CONTENT_ERROR` は 4 か所すべてが `true` です（SPEC-PDFSPEC-COMMON-ERRORS-003 が「箇所ごとに決める」と定めている）。reader・writer・verify は `code` ごとに値が 1 つに決まっていて、spec だけが例外です。受け側は `code` だけで再試行を決められません。

`CONTENT_ERROR` を投げる 4 か所を読むと、どれも引数で指したものが無い場合でした。

| 箇所 | 状況 |
| --- | --- |
| `getSectionContent` | 指した節が無い |
| `getRequirements`（節の指定） | 指した節が無い |
| `getDefinitions` | 指した仕様では定義の抽出ができない（`iso32000-2`・`pdf17` 以外） |
| `getTables` | `table_index` が範囲外 |

2026-11-06 の決定: 知らない `spec` の id を `INVALID_ARGUMENT`（`retryable: true`）に移し、`REGISTRY_ERROR` を常に `false` にする。`CONTENT_ERROR` も同じ見方で分け、引数で指した節・表・ページが無いものは `INVALID_ARGUMENT`、読めないものは `CONTENT_ERROR` にする。`code` の値が変わるので破壊的変更です。正本 `common-errors` の Purpose に残っている旧い文（「移行の版のあいだ旧い名前も返す」「`REGISTRY_ERROR` は箇所によって `retryable` が違う」）も、この変更で直します。

## What Changes

- 知らない `spec` の id（`getSpecPath`・`resolveSpecId`）は `REGISTRY_ERROR` ではなく `INVALID_ARGUMENT` にする。`next_actions` の `list_specs` の案内は残す。
- `CONTENT_ERROR` の 4 か所は、すべて `INVALID_ARGUMENT` にする。`next_actions` は残す。
- `retryable` を `code` ごとに固定する: `INVALID_ARGUMENT` は `true`、`REGISTRY_ERROR`・`CONTENT_ERROR`・`PREREQUISITE_ERROR`・`INTERNAL_ERROR` は `false`。エラーを作る箇所では選ばせない（`RETRYABLE` の表から引く）。
- 正本の Purpose を、archive の後に直す（OpenSpec の差分は Purpose を書き換えないため）。

### 変わる振る舞い

- 知らない `spec` の id の `code`（`REGISTRY_ERROR` → `INVALID_ARGUMENT`）。
- 指した節が無い・`table_index` が範囲外・定義の抽出ができない仕様の `code`（`CONTENT_ERROR` → `INVALID_ARGUMENT`）。`retryable` は `true` のまま。

### 変わらない振る舞い

- `PDF_SPEC_DIR` のエラーの `REGISTRY_ERROR`（`retryable: false`）と、その `hint`・`next_actions`。
- `PREREQUISITE_ERROR`（`compare_versions` の前提）。
- エラーの本文の形（SPEC-PDFSPEC-COMMON-ERRORS-001）。

### 対象外

- いま `CONTENT_ERROR` を投げる箇所は無くなる。仕様書の PDF を読めない失敗は、いまは例外の種類によって `INTERNAL_ERROR` になる。これを `CONTENT_ERROR` にするのは別の変更にする。
- pdf-agent-stack のサイトの Error Codes の spec の行（spec の公開の後に PR で直す）。

## Capabilities

- `common-errors`（MODIFIED: 002・003）

## 人が判断すること

- `CONTENT_ERROR` の 4 か所をすべて `INVALID_ARGUMENT` にすること。とくに `get_definitions` の「この仕様では定義の抽出ができない」は、`spec` の値を変えれば通るので引数の誤りと見なしました。
- 版。`code` の値が変わるので、spec の minor（0.14.0）を提案します。
