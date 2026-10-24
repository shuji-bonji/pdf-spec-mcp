---
approved:
pr:
implementation: required
targets: [get-section, get-tables, get-requirements]
---

# Proposal

## Why

構造木を読む処理（`content-extractor.ts` の `walkStructTree`）は、扱い方を決めていない役割（TOC / TOCI / Link / Span / Caption / Figure など）の要素では子の要素へ進むだけで、その要素の直下にある文字（content item）をどこにも集めていません（CLAUDE.md 落とし穴 1b、Issue #25）。ISO 32000-2 §14.7.5.1 は、どの構造要素も content item を直接の子に持てると定めています。文字が消えるのは仕様の制約ではなく、この実装の読み落としです。

この読み落としのため、iso32000-2（EC3）では次のことが起きています。

- `Contents` の節が 0 要素になる。扉ページ（`ISO 32000-2:2020 front page`）と正誤表の 7 節（Issue #156 / #334 / #223・#226 / #374 / #415 / #418 / #419）で本文の一部が消える。
- 正誤表の 4 つの表（Table 323a / 352a / 377 / 409a）のキャプションの段落が消え、`get_tables` の `caption` が `null` になる。
- その表から拾った要件 6 件に `table` が付かない。

Figure の中の文字（図中のラベル・座標・ノード番号など）も同じ理由で消えています。ISO 32000-2 §14.8.4.8.5 の Table 373 は、Figure が囲む内容の例に「軸の値を示す文字を含むグラフ」を挙げており、Figure の中の文字は図の一部です。同じ箇所は、Figure を中身を調べずに静的な図として扱ってもよい、とも書いています。拾うか捨てるかはどちらも仕様の範囲内で、この変更では拾うことにしました（2026-10-25 に人が決定）。

## What Changes

- 構造木の読み方を 1 か所変える。扱い方を決めていない役割の要素は、`P` の入れ子（SPEC-PDFSPEC-GET-SECTION-012）と同じやり方で読む。ブロック要素の子はこれまでどおり要素として読み、その間にある文字は段落としてまとめる。Figure も同じ扱いにする。
- 見出し・表・リストの作り方、節の切り方（SPEC-PDFSPEC-GET-SECTION-007〜011）、表のつなぎ方、要件の拾い方は変えない。

### 変わる振る舞い

全節に 3 ツールを流した差分（0.9.0 の `.golden` との比較、`scripts/dump-sections.mjs` → `scripts/diff-dumps.mjs`）で確かめた数字です。

- **get_section**: iso32000-2 の 987 節のうち 24 節で、`paragraph` の要素が増える。
  - 前付と正誤表の 10 節: `ISO 32000-2:2020 front page`（19 → 23 要素）、`Contents`（0 → 4）、`Additional errata pages`（96 → 104）と、その子の正誤表 7 節。
  - 本文で Figure の文字が入る 6 節: 12.5.6.6 / 14.10.3.1 / H.5 / H.6 / H.8.2 / H.8.3。どの図でも、図の文字の段落は「Figure N — …」のキャプションの段落の直前に入る。
  - 上の 6 節の祖先 8 節: 12 / 12.5 / 12.5.6 / 14 / 14.10 / 14.10.3 / Annex H / H.8。
- **get_tables**: キャプションが `null` の表が 56 → 48 になる。正誤表の 4 表に `caption` が入り、それぞれ子の節と親の `Additional errata pages` の両方で数えるので 8 件減る。
- **get_requirements**: Issue #156 の 5 件と Issue #374 の 1 件、計 6 件の要件に `table`（キャプション）が付く。同じ 6 件は親の `Additional errata pages` からも見える。
- **search_spec**（この変更では仕様を起こさない）: 検索索引の 11 区切りで文字が増える。正誤表の 7 ページ（pp.1008〜1018）と、Figure を持つ 4 ページ（p.820 の 14.10.3.1、p.927 の H.5、p.940 の H.8.2、p.945 の H.8.3）。どの区切りも、どの節に属するかは変わらない。

### 変わらない振る舞い

- iso32000-2 の表の数（1,681。葉の節だけなら 460）と行数、要件の総数（25,068）、自分の見出しで始まる節の数（979）、ページで切れた節（12）、`boundary` の内訳、`pageRange`。
- pdf17 の 823 節は 3 ツールとも差 0 件（Figure の文字も含めて）。
- 見出し（`heading`）・表・リスト・注記の要素の数。増えるのは `paragraph` だけ。差のある 24 節すべてで、変更前の要素は 1 つも変わらず、順序も保ったまま残る（新しい段落が間に入るだけ）ことを確かめた。
- `Artifact` の文字を出さないこと（SPEC-PDFSPEC-GET-SECTION-004）。

### 対象外

- `Issue #379`（p.1020）が 0 要素のままのこと。この変更を当てても 0 要素で、原因は別にある。別の Issue で切り分ける。
- Figure の文字に専用の要素の種類（`figure` など）を作ること。今回は `paragraph` として出す。
- 構造木の根（ページの構造木の最上位）の直下にある文字。読み方を変えない（根は役割を持つ要素ではなく、`walkStructTree` が直接読む）。
- `search_spec` の仕様（`openspec/specs/search-spec/`）を起こすこと。

### 人が判断すること

- Figure の中の文字を拾うこと（決定済み・2026-10-25）。図中の座標やノード番号が `paragraph` として本文に混ざる。要件の総数は変わらないことを確かめた（図の文字に規範の語を含む文は無い）。
- Figure の文字を、本文の段落と同じ `paragraph` として出してよいか。見分けたい利用者がいれば、別の変更で要素の種類を足す。
- 引き継ぎ書（2026-10-21）にあった「正誤表の要件 31 件に `table` が付く」は数え方の誤りで、正しくは 6 件。31 は差のあった 3 節の要件の件数（25 + 5 + 1）を足した数で、親と子で同じ要件を重ねて数えていた。

## Capabilities

### New Capabilities

- なし（3 つの capability の初版は、先に `spec-init/content-tools` で起こす）。

### Modified Capabilities

- `get-section`: SPEC-PDFSPEC-GET-SECTION-013 を ADDED で足す（扱い方を決めていない役割の直下の文字を段落にする）。
- `get-tables`: SPEC-PDFSPEC-GET-TABLES-008 を ADDED で足す（そのような段落もキャプションになる）。
- `get-requirements`: SPEC-PDFSPEC-GET-REQUIREMENTS-008 を ADDED で足す（そのような表の要件にも `table` が付く）。

## Impact

- `src/services/content-extractor.ts` の `visitStructElement`（最後の 1 行。`walkStructTree` で子へ進むだけだったところを `visitContainerParagraph` に替える）。
- `src/services/content-extractor.test.ts`・`src/services/pdf-service.test.ts` に受入テストを足す（CI で回る）。e2e の 04 / 06 / 08 にも実際の節で 1 件ずつ足す。
- `.golden/iso32000-2.digest.json` を更新する（`.golden/pdf17.digest.json` は変わらない）。何を意図して受け入れたかを CHANGELOG に書く。
- 検索索引と要件の索引の切り方が変わるので、ディスクキャッシュは版で外れる（落とし穴 7）。保存形式は変えないので `INDEX_SCHEMA_VERSION` は上げない。
- 破壊的変更ではない（要素と `caption` / `table` の値が増えるだけ）。版は minor（0.10.0）を想定する。版は人が決める。
