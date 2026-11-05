---
approved:
pr:
implementation: required
targets: [list-specs, common-output]
---

# Proposal

## Why

pdf-spec-mcp の応答から、利用者は「どの文書を読んだか」「どの文書を読まなかったか」を知ることができません（#32・F-27・F-30）。

1. **`list_specs` が、認識しなかったファイルに触れない**（F-27）。`PDF_SPEC_DIR` に PDF を 18 本置いたところ、`list_specs` は `totalSpecs: 17` を返し、残りの 1 本（`Deriving_HTML_from_PDF_1-2.pdf`）は自動検出のパターン（`src/config.ts` の `SPEC_PATTERNS`）に無く、応答のどこにも出ませんでした。
2. **`spec` を省いたとき、どの仕様を使ったかが応答に無い**（F-30）。E4 の UC05 で `search_spec`・`get_requirements`・`get_section` を `spec` なしで呼んだところ、どの応答にも使った仕様の id がありませんでした。既定は `iso32000-2` です。

`list_specs` の仕様はまだありません。この変更で capability `list-specs` の初版を起こし、この振る舞いだけを書きます。使った仕様の id は 7 ツールに共通する出力なので、共通の capability `common-output`（`kind: common`）として起こします。

## What Changes

- `list_specs`: `PDF_SPEC_DIR` にある `.pdf` のうち、どのパターンにも当たらなかったファイルの名前を `unrecognizedFiles`（名前の昇順の配列。無ければ `[]`）で返す。
- `spec` 引数を取る 6 ツール（`get_structure`・`get_section`・`search_spec`・`get_requirements`・`get_definitions`・`get_tables`）は、応答の最初の項目 `spec` に、使った仕様の id を返す。`spec` を省いたときは既定の id（`iso32000-2`）になる。
- `compare_versions` は、比べた 2 つの仕様の id を `specs: ["pdf17", "iso32000-2"]` で返す。

### 変わる振る舞い

- 上の 7 ツールの応答に項目が加わる（項目の追加）。

### 変わらない振る舞い

- 自動検出のパターンと、同じ id に複数のファイルが当たったときの優先順。
- 応答の既存の項目。

### 対象外

- 同じ id の 2 本目以降（例: EC3 があるときの EC2）を応答に出すこと。いまはパターンには当たるが登録されず、ログにだけ出る。
- `.pdf` 以外のファイル（`.DS_Store` など）を `unrecognizedFiles` に入れること。

## Capabilities

- `list-specs`（新規。`kind: tool`。ADDED: 001）
- `common-output`（新規。`kind: common`。ADDED: 001）

## 人が判断すること

- `compare_versions` に `spec` ではなく `specs`（配列）を返すこと。1 つの値では 2 つの仕様を名指せないためです。
- `spec` を JSON の最初の項目に置くこと（verify の `file_path` と同じく、何についての応答かを最初に読めるようにする）。
