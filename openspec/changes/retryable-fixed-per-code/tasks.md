# Tasks

## 0. 前提

- [x] 0.1 方針は人が決めている（#32 のコメントの「同じ版で直すこと」、2026-11-06）。ブランチは `fix/spec-name-what-was-read`

## 1. 受入テスト（先に落ちることを確かめる）

- [x] 1.1 `src/error-contract.test.ts` と `src/errors.test.ts` に足す。名前を「SPEC-PDFSPEC-COMMON-ERRORS-<3 桁> <Scenario 名>」で始める
- [x] 1.2 既存のテストで `REGISTRY_ERROR`・`CONTENT_ERROR` の `retryable: true` を固定しているものを、新しい期待に書き換える
- [x] 1.3 変更前の `src/` で 1.1 が落ちることを確かめる

## 2. 実装

- [x] 2.1 `src/errors.ts`: `RETRYABLE` の表を置き、`RegistryError`・`ContentError` の `retryable` の引数をなくす
- [x] 2.2 知らない `spec` の id（`pdf-registry.ts` の 2 か所）と `CONTENT_ERROR` の 4 か所（`pdf-service.ts`）を `ValidationError` にする
- [x] 2.3 README・CHANGELOG に破壊的変更として書く。CI の一覧が終了コード 0

## 3. 確認

- [x] 3.1 `tools/list` の差が無いことを確かめる

## 4. 承認と取り込み（人が判断する）

- [ ] 4.1 人が `proposal.md` の front matter に `approved: YYYY-MM-DD` と `pr: N` を書く
- [ ] 4.2 マージの前に、同じ PR の中で `npx openspec archive retryable-fixed-per-code --yes` を実行する
- [ ] 4.3 archive の後、正本 `openspec/specs/common-errors/spec.md` の Purpose を直す: 「移行の版のあいだ旧い名前（`VALIDATION_ERROR`）も返すこと」を外し、「`REGISTRY_ERROR` は起きた箇所によって `retryable` の値が違うので、`code` だけでは決められません」を「`retryable` は `code` ごとに 1 つの値で、`code` だけで再試行を決められます」に直す
- [ ] 4.4 `npx openspec validate --all && npx spec-ids check` が通る
