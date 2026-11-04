# Tasks

## 0. 前提

- [x] 0.1 人が proposal.md を承認している（1 本の PR で提案・仕様・実装・archive を進める。ブランチは `fix/family-error-contract`）

## 1. 受入テスト（先に落ちることを確かめる）

- [x] 1.1 `src/error-contract.test.ts` を足す。各 Scenario を 1 件以上のテストにし、名前を「SPEC-PDFSPEC-COMMON-ERRORS-<3 桁> <Scenario 名>」で始める。ツールは McpServer に登録した実物を InMemoryTransport で呼び、本文の JSON を見る（仕様 PDF の要らない入力だけを使い、CI で回る）
- [x] 1.2 `VALIDATION_ERROR` を見ている既存のテスト（`src/errors.test.ts`・`src/registry.test.ts`・`src/utils/validation.test.ts`）を `INVALID_ARGUMENT` に直す。期待の意味は変えない
- [x] 1.3 変更前の `src/` で 1.1 が落ちることを確かめる

## 2. 実装

- [x] 2.1 `src/errors.ts`: `ValidationError` の `code` を `INVALID_ARGUMENT` にし、`detail.legacyCode` を持たせる。`SpecServiceError` に `detail` を足し、`retryable` を必須にする。`RegistryError`・`ContentError` の `retryable` を必須の引数にする。`toStructuredError` の `INTERNAL_ERROR` に `retryable: false` を書く
- [x] 2.2 `src/tools/handlers.ts` の冒頭コメントなど、`VALIDATION_ERROR` を書いている文を直す
- [x] 2.3 `npm run check`（biome）・`npm run typecheck`・`npm run typecheck:tests`・`npm run check:imports`・`npm test`・`npm run build` が終了コード 0

## 3. 出力が変わらないことの確認

- [x] 3.1 変更前と変更後の `dist` を起動し、`tools/list` の差が無いことを確かめる
- [x] 3.2 pdf-agent-stack の `eval/e2e` の S6 を `PDF_E2E_SPEC_DIR` で手元のビルドに向けて回し、spec の 2 件が通ることを確かめる

## 4. 版と記録

- [x] 4.1 `CHANGELOG.md`（英語）の `[Unreleased]` に書く。版は人が決める
- [x] 4.2 `README.md` と `README.ja.md`、`docs/` にエラーのコードの記述があれば両方を直す（どこにも `VALIDATION_ERROR` の記載は無かったので、変更なし）
- [x] 4.3 `record.md` を計画 §8 の書式で書く

## 5. 承認と取り込み（人が判断する）

- [x] 5.1 人が `proposal.md` の front matter に `approved: YYYY-MM-DD` と `pr: N` を書く
- [x] 5.2 マージの前に、同じ PR の中で `npx openspec archive family-error-contract --yes` を実行する
- [x] 5.3 archive の後、正本 `openspec/specs/common-errors/spec.md` の先頭に front matter（`spec_id: PDFSPEC`・`kind: common`・`introduced_by: family-error-contract`）を書き足し、Purpose の置き文（TBD）を 50 文字以上の文に書き換える（OpenSpec 1.14.1 は差分の front matter を写さない。置き文のままだと validate が警告し、front matter が無いと spec-ids check と pr-scope が落ちる）
- [x] 5.4 `npx openspec validate --all && npx spec-ids check` が通る
