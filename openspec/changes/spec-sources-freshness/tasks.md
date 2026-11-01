# Tasks

## 1. 提案

- [x] 1.1 proposal / 差分 spec（`spec-sources` の 001〜003）/ design / tasks を書く。`approved` と `pr` は空のまま

## 2. 受入テスト（先に落ちることを確かめる）

- [x] 2.1 `src/services/spec-sources.test.ts` に、001〜003 の Scenario 名を持つ 7 件を書く（CI で回る `src/` 側）
- [x] 2.2 修正の前に、6 件が落ちることを確かめる（7 件目「変わらなければ読み直さない」は修正の前も通る。修正の後も通り続けることを固定する）

## 3. 実装

- [x] 3.1 登録簿: 走査の失敗を覚えない・フォルダーの更新時刻で読み直す・仕様書ごとの指紋と `getSpecVersion`
- [x] 3.2 pdf-service: `memo`（失敗した Promise を消す）・`resolveFresh` と `forget`
- [x] 3.3 読み込み: `evictDocument`。LRU: `deleteWhere`
- [x] 3.4 注入の型で `getSpecVersion` と `evictDocument` を必須にし、`defaultPdfService`・`cli.ts`・テストの偽物に渡す
- [x] 3.5 `npm run check:engines` → `check` → `check:imports` → `typecheck` → `typecheck:tests` → `build` → `check:public-types` → `test` がすべて終了コード 0
- [x] 3.6 `npm run test:e2e`（仕様 PDF のある環境）と `npm run golden:check`（全数差分。差 0 を期待）
- [x] 3.7 ビルドした `dist` を stdio で起動し、壊れた PDF の置き換え・ページ数の違う PDF への差し替え・仕様書の追加を試す（record.md に書く）

## 4. 文書と記録

- [x] 4.1 `CHANGELOG.md`（英語）の Unreleased に Fixed を書く。版は人が決める
- [x] 4.2 CLAUDE.md に落とし穴 5b を足す
- [x] 4.3 `record.md` を計画 §8 の書式で書く

## 5. 承認と取り込み（人が判断する）

- [ ] 5.1 人が `proposal.md` の front matter に `approved: YYYY-MM-DD` と `pr: N` を書く
- [ ] 5.2 `npx openspec archive spec-sources-freshness --yes` で `openspec/specs/spec-sources/spec.md` を作る（マージの前に）
- [ ] 5.3 archive が作った正本の先頭に front matter（`spec_id: PDFSPEC`・`kind: common`・`introduced_by: spec-sources-freshness`）を書き足す
- [ ] 5.4 `npx openspec validate --all && npx spec-ids check` と `pr-scope` が通る
