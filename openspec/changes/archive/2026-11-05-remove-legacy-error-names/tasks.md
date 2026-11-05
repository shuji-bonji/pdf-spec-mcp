# Tasks

## 0. 前提

- [x] 0.1 人が proposal.md を承認している（2026-11-05 21:52 にチャットで旧名の削除を依頼された。`approved` は人が書く。ブランチは `feat/remove-legacy-error-names`）

## 1. 受入テスト（先に落ちることを確かめる）

- [x] 1.1 `src/error-contract.test.ts` の 004 の describe を消し、002 に「移行の版の旧い名前を返さない」を足す
- [x] 1.2 変更前の `src/` で 1.1 が落ちることを確かめる

## 2. 実装

- [x] 2.1 `src/errors.ts`: `ValidationError` が `detail.legacyCode` を書かないようにし、`ErrorDetail` から `legacyCode` を外す
- [x] 2.2 CHANGELOG（英語）

## 3. 確認

- [x] 3.1 CI と同じ一覧（`.github/workflows/ci.yml`）が終了コード 0
- [x] 3.2 `npx openspec validate --all` が通る（`npx spec-ids check` は archive の前は 004 で落ちる。archive の後に通ることを確かめる）

## 4. 承認と取り込み（人が判断する）

- [x] 4.1 人が `proposal.md` の front matter に `approved` と `pr` を書く
- [x] 4.2 マージの前に `npx openspec archive remove-legacy-error-names --yes` を実行する（チェックは archive の前に入れる）
