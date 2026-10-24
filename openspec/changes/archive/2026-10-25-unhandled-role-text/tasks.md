# Tasks

## 0. 前提（別の PR）

- [x] 0.1 `spec-init/content-tools`（get-section 001〜012・get-tables 001〜007・get-requirements 001〜007 の初版と、既存テスト名への仕様 ID の追加）がマージされている

## 1. 受入テスト（先に落ちることを確かめる）

- [x] 1.1 `src/services/content-extractor.test.ts` に `describe('unhandled roles')` を足し、`it` の名前を「SPEC-PDFSPEC-GET-SECTION-013 <Scenario 名>」にして、合成の構造木の Scenario 4 件を書く
- [x] 1.2 `src/services/pdf-service.test.ts` に、`it('SPEC-PDFSPEC-GET-TABLES-008 Div の直下のキャプション')` と `it('SPEC-PDFSPEC-GET-REQUIREMENTS-008 Div の直下のキャプションを持つ表の要件')` を書く
- [x] 1.3 e2e に実際の節の Scenario を足す（04: GET-SECTION-013 の 2 件、08: GET-TABLES-008、06: GET-REQUIREMENTS-008）。期待値は proposal の実測の値で、仕様 ID のために変えない
- [x] 1.4 `npx vitest run src/services/content-extractor.test.ts src/services/pdf-service.test.ts` で、足した受入テスト 6 件が変更前の `src/` で 6 件とも落ちることを確かめる（変更前は入れ物の直下の文字が消えるので、どの Scenario も期待する段落・キャプションが無い）

## 2. 実装

- [x] 2.1 `src/services/content-extractor.ts` の `visitStructElement` の最後の `return walkStructTree(child, ctx);` を `return visitContainerParagraph(child, ctx);` に替え、冒頭コメント（落とし穴 1b の内容）を新しい振る舞いに合わせて書き直す
- [x] 2.2 `extractPageSegments` の JSDoc の「walkStructTree drops text whose only home is an unhandled container」を、今の振る舞いに合わせて直す（素のテキストに落とす分岐そのものは残す）
- [x] 2.3 CLAUDE.md の落とし穴 1b を、直した内容と残っている Issue #379 に書き換える
- [x] 2.4 `npm test`・`npm run check`・`npm run typecheck`・`npm run typecheck:tests`・`npm run check:imports` が終了コード 0

## 3. 全数差分と基準線

- [x] 3.1 変更前の dist（main）と変更後の dist で、pdf17 と iso32000-2 の全節を `scripts/dump-sections.mjs` で落とし、`scripts/diff-dumps.mjs` で比べる。proposal の数字（iso32000-2: 差のある節 24・キャプション null 56 → 48・要件 25,068、pdf17: 差 0 件）と一致することを確かめる
- [x] 3.2 変更前後の `buildSearchIndex` の区切りを比べ、11 区切りで文字が増え、属する節が変わらないことを確かめる
- [x] 3.3 `npm run golden:update` で `.golden/iso32000-2.digest.json` を更新し、`npm run golden:check` が差 0 件になる
- [ ] 3.4 `npm run test:e2e`（手元）が通る（コンテナでは iso32000-2 と pdf17 の分だけ確認。仕様 PDF を置いていない 15 仕様の 35 件は未確認）

## 4. 版と記録

- [x] 4.1 `CHANGELOG.md`（英語）の `[Unreleased]` に、変わる振る舞いと、`.golden` で意図して受け入れた差（24 節・キャプション 8 件・要件 6 件の `table`）を書く。版は人が決める
- [x] 4.2 `record.md` を計画 §8 の書式で書き足す（版・かかった時間・人が判断した箇所・仕様と実装のずれ・読み返した回数）

## 5. 承認と取り込み（人が判断する）

- [x] 5.1 人が `proposal.md` の front matter に `approved: YYYY-MM-DD` と `pr: N` を書く
- [x] 5.2 マージの前に、同じ実装 PR の中で `npx openspec archive unhandled-role-text --yes` を実行し、013 / 008 / 008 を正本に取り込む
- [x] 5.3 `npx openspec validate --all && npx spec-ids check` が通る
