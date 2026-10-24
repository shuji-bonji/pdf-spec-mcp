# Design

## 仕様の制約

- ISO 32000-2 §14.7.5.1: どの構造要素も content item（marked-content の並びなど）を持てる。構造要素の `K` は、content item と子の構造要素を何個でも混ぜて持てる。役割によって「文字を直下に持たない」という制約は無い。
- ISO 32000-2 §14.8.4.8.5（Table 373）: Figure は図の内容を囲む。囲む内容の例に「軸の値を示す文字を含むグラフ」がある。同じ節は、Figure を中身を調べずに静的な図として扱ってもよいとも書いている。Figure の文字を拾うことも捨てることも、仕様の範囲内。
- 構造型の扱い（TOC / TOCI / Link / Span / Caption）を個別に決める条文の読み直しは、この変更では要らない。役割ごとの意味づけ（目次の項目として出す、など）はしないで、文字を落とさないことだけを変える。

## ライブラリの制約

- 構造木と文字は、ページごとに pdfjs の `getStructTree()` と `getTextContent({ includeMarkedContent: true })` から作る。構造木の葉は `{ type: 'content', id }` で、文字は marked-content の id で引く（`buildTextMap`）。この組み立ては変えない。
- 構造木を持たないページの扱い（SPEC-PDFSPEC-GET-SECTION-005）と、`search_spec` の索引で見出しが 1 つも見つからないページを素のテキストで索引する扱い（`extractPageSegments`）は変えない。後者があるので、扉・目次のページは今も検索には出ている。

## 変更点

`src/services/content-extractor.ts` の `visitStructElement` の最後の行を替える。

```ts
// 変更前: 子の要素へ進むだけ。直下の content 葉は walkStructTree が読み飛ばす
return walkStructTree(child, ctx);
// 変更後: P の入れ子と同じ読み方。ブロックの子は要素として読み、間の文字は段落にまとめる
return visitContainerParagraph(child, ctx);
```

`visitContainerParagraph` は #15 / #16 で `P` の入れ子のために作ったもので、次のことを既にしている。

- 直下の content 葉と、ブロックでない子（`Span` / `Link` / `Figure` など）の文字を、ひと続きの段落にまとめる
- ブロックの子（`BLOCK_ROLES` に入っているか、ブロックを子孫に持つもの）は、`visitStructElement` で要素として読む
- `Artifact` の子は飛ばす
- まとめた文字は `paragraphElements` に通すので、NOTE / EXAMPLE の判定と、目次の項目との照合（見出しへの昇格）がそのまま当たる

`Sect` / `Div` のようにブロックの子だけを持つ入れ物では、まとめる文字が無いので、これまでと同じ要素が同じ順で出る（全節の差分で、変更前の要素が 1 つも変わらず順序も保っていることを確かめた）。

試した案で、採らなかったもの:

- `visitContainerParagraph` の中で `Figure` を飛ばす案。差が出る節は 10 に収まるが、`Figure` が入れ物の直下にあるとき（`visitContainerParagraph` から呼ばれたとき）だけ飛ばし、構造木の根から直接 `visitStructElement` に渡ったときは拾ってしまい、同じ図でも置かれ方で扱いが変わる。Figure を拾う決定と合わせて採らない。

## 受入テスト

- `src/services/content-extractor.test.ts`: `describe('unhandled roles (SPEC-PDFSPEC-GET-SECTION-013)')` を足し、Scenario の合成の構造木（`TOC > TOCI`、`Div > Figure + P`、`Sect > 文字 + P + 文字`、`Div > Artifact + 文字`）を `extractSectionContent` に通す。
- `src/services/pdf-service.test.ts`: `Div` の直下にキャプションの文字を置き、その直後に表を置いた合成の文書で、`getTables` の `caption` と `getRequirements` の `table` を見る（GET-TABLES-008・GET-REQUIREMENTS-008）。
- e2e（仕様 PDF のある手元だけ）: 04 に `Contents` と `12.5.6.6`、08 と 06 に `Issue #156` を足す。
- 受入テストは、変更前の `src/` で落ちることを先に確かめる。

## 全数差分

`.golden` の更新の前に、変更前の dist と変更後の dist で全節を落とし、`scripts/diff-dumps.mjs` で比べる。proposal の「変わる振る舞い」の数字（iso32000-2 は 24 節・キャプション null 56 → 48・要件 25,068 のまま、pdf17 は差 0 件）と一致することを確かめてから `npm run golden:update` を回す。`search_spec` の索引は `.golden` に入っていないので、変更前後の `buildSearchIndex` の区切りを比べて「11 区切りで文字が増え、属する節は変わらない」を確かめる。
