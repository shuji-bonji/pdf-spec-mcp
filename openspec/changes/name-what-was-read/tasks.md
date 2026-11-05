# Tasks

## 0. 前提

- [x] 0.1 方針は人が決めている（#32 のコメント、2026-11-06）。ブランチは `fix/spec-name-what-was-read`（`retryable-fixed-per-code` と同じ版）

## 1. 受入テスト（先に落ちることを確かめる）

- [ ] 1.1 `src/name-what-was-read.test.ts` を足す。名前を「SPEC-PDFSPEC-<機能>-<3 桁> <Scenario 名>」で始める。仕様書の PDF が要るものは、既存のテストと同じく検体で組む
- [ ] 1.2 変更前の `src/` で落ちることを確かめる

## 2. 実装

- [ ] 2.1 `src/services/pdf-registry.ts`: パターンに当たらなかった `.pdf` の名前を持つ
- [ ] 2.2 `src/tools/handlers.ts`: `list_specs` に `unrecognizedFiles`、6 ツールに `spec`、`compare_versions` に `specs`
- [ ] 2.3 ツールの説明・README・CHANGELOG に書く。CI の一覧が終了コード 0

## 3. 確認

- [ ] 3.1 `tools/list` の差がツールの説明の文だけであることを確かめる

## 4. 承認と取り込み（人が判断する）

- [ ] 4.1 人が `proposal.md` の front matter に `approved: YYYY-MM-DD` と `pr: N` を書く
- [ ] 4.2 マージの前に、同じ PR の中で `npx openspec archive name-what-was-read --yes` を実行する
- [ ] 4.3 archive の後、正本 `openspec/specs/list-specs/spec.md`（`kind: tool`）と `openspec/specs/common-output/spec.md`（`kind: common`）の先頭に front matter（`spec_id: PDFSPEC`・`introduced_by: name-what-was-read`）と Purpose（50 文字以上）を書き足す
- [ ] 4.4 `npx openspec validate --all && npx spec-ids check` が通る
