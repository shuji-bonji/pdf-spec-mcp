# pdf-spec-mcp - 開発ガイド

## プロジェクト概要

ISO 32000（PDF）等の仕様 PDF を構造的に読む MCP サーバ。PDF family における「**仕様は何を要求するか**」担当であり、
family 規約 §2.0 により **writer / reader / verify の実装判断はここの原文照合を経る**。
つまり**このリポジトリの抽出品質が family 全体の設計判断の質を決める**。

- 残タスク / 次セッションの指示: [`docs/NEXT-SESSION.md`](./docs/NEXT-SESSION.md)
- family 規約への整合状況: [`docs/family-standards-alignment.md`](./docs/family-standards-alignment.md)
- 規約本体: `Document-Note/mcps/PDFfamily/specs/06-family-implementation-standards.md`

仕様 PDF は著作物のため配布しない。`PDF_SPEC_DIR` で置き場所を指定する（`.gitignore` 済み）。

## ⚠️ サンドボックスから `npm install` を実行しないこと

**`node_modules` は macOS のホストと Linux サンドボックスで同一実体を共有している。**
npm はプラットフォーム別の optionalDependencies を「今の環境に合う物だけ」入れて**他を取り除く**ため、
サンドボックス（linux-x64）で `npm install` すると **ホストの mac 用バイナリが消える**。

実際に起きた（2026-07-18）: サンドボックスでの `npm install` が `@biomejs/cli-darwin-arm64` を落とし、
ホストの `npm run format` が `Cannot find module '@biomejs/cli-darwin-arm64/biome'` で全滅した。
Biome は薄いラッパがプラットフォーム別バイナリを探す構成なので、本体があっても動かない。
同じ形の依存（`@rollup/rollup-*` / `esbuild` / `@napi-rs/canvas-*` / `fsevents`）すべてに当てはまる。

**「どちらか一方の OS でしか動かない」状態になる。** ホストで `npm install` し直すと今度は
サンドボックス側で **`biome` と `vitest` が両方落ちる**（vitest は rollup のネイティブバイナリを要求する。
「vitest は純 JS だから動く」は誤り）。サンドボックスで純粋に動くのは `tsc` だけ。

- **エージェント**: `npm install` / `npm ci` を実行しない。ホストが install した直後は
  `npm test` / `biome` も動かないので、**テストと lint はホスト側で実行してもらう**。
  依存を変えたいときは `package.json` を編集し、**ホストでの `npm install` を依頼する**。
  ただし `npm run check:imports` は素の node で動くので、**import を触ったら必ず実行する**
  （biome の `organizeImports` 違反はこれで事前に潰せる。ホストに投げて指摘されるのは無駄）
- **ホスト**: 壊れた場合は `npm install` で直る（`package-lock.json` には全 8 プラットフォームの
  エントリがあるので lockfile は無傷。CI の `npm ci` も各 OS で正しく解決する）

## 落とし穴

### 1. ページ跨ぎの表 — 「セクション境界の帯」（B-S1 / 2026-07-18 修正）

セクションのページ範囲は outline から `[page, 次セクションの page - 1]` として決まる。
表が最終ページを越えて続くと、**残りの行は「次セクションの先頭ページの、見出しより上」に取り残される**。
この帯はどのセクションにも属さない — 当該セクションのページ範囲外であり、かつ
`trimToSectionStart` が次セクションの内容から捨てるため、**行が丸ごと消える**。

全 988 セクションの走査で **148 個の表**が行を落としていた（Table 182 の `QuadPoints`、
Table 166 の `CA`/`BM`/`Lang`、Table 171 の注釈型 7→28 行、Annex A の演算子 11→73 行）。
`getTables` は `collectTrailingTableRows` で帯を回収する。セクション**内**の継続は元々
`collectStructTreeTables` が連結できており、穴は境界だけだった。

**同じ帯は本文・要件文でも落ちたまま**（`get_section` / `get_requirements`）。S-5 として未着手。

### 2. 連結の条件は `collectStructTreeTables` の連結規則と必ず揃える

`collectStructTreeTables` は `headers.length > 0` の表しか連結しない。継続行だけ足すと
**連結されずに表が 1 個増え、以降の `table_index` がずれる**（8.7.4.5.5 で実際に出した退行）。
欠落行より悪い。ヘッダなしの表を対象外にしているのはこのため（S-4）。

### 3. 「LRU を検証している」テストは LRU に届いていなかった（2026-07-18 是正）

`get_structure` は `getSectionIndex` のメモ（spec ごと・**上限なし・無期限**）を引くため、
**2 回目以降は loader を一切呼ばない**。e2e の X-1〜X-3 はこれを通してドキュメント LRU を
検証したつもりだったが、実際には section-index メモを測っていただけで、
**LRU が完全に壊れていても緑のまま**だった（`pdf-loader.test.ts` にも LRU テストは無かった）。

教訓: **キャッシュの層が 2 つある**（上位 = section-index メモ、下位 = ドキュメント LRU）。
上位を通すテストは下位に届かない。ドキュメント LRU は `DocumentLoaderService` に
`DocumentSource` を注入して直接検証する（`pdf-loader.test.ts`）。

### 4. stdout を汚すのは `console.log` と `console.info`（`warn` ではない）

Node では **`console.log` / `console.info` が stdout**、`warn` / `error` は stderr。
pdfjs-dist v5 の実際の経路は `warn()` → `console.warn`（stderr・**stdout は汚さない**）、
`info()` → `console.info`（stdout）、`deprecated()` → `console.log`（stdout）。
「pdfjs の warn が stdout を汚す」は**誤り**なので引き写さないこと。
`src/utils/stdout-guard.ts` が log / info / warn を stderr へ転送する。
ESM は import を巻き上げるため、ガードは `index.ts` の**最初の import** でなければ意味がない。

## テスト

```bash
npm test              # ユニット（仕様 PDF 不要）
npm run test:e2e      # 実 PDF（PDF_SPEC_DIR=./pdf-spec）
npm run check:imports # import 順（biome なしで動く。サンドボックスからでも実行可）
```

- `PDFSpecService` は registry / loader を**コンストラクタ注入**するので、`vi.mock` なしで
  合成 PDF を組んで実コードを通せる（`src/services/pdf-service.test.ts` が実例）
- **新しいテストは必ず「壊して落ちる」ことを確認する**。通ってしまうならバグを捉えていない。
  旧実装に当てる（B-S1）か、dist を変異させる（LRU）。実際どちらでも自分のテスト/主張の
  誤りが 1 件ずつ見つかっている
- pdfjs は import 時に `DOMMatrix` を要求する（本来 `@napi-rs/canvas` が供給）。LRU のように
  pdfjs が無関係なロジックを素の node で回したいときは `globalThis.DOMMatrix ??= class {}` で
  import を通せる
- 抽出ロジックを変えたら、**旧実装を `git worktree` で並べてビルドし、全セクションに
  `get_tables` 等を流して JSON 差分を取る**。「行を失った表 0 / 表の個数が変わった表 0」を
  機械的に示せる。8.7.4.5.5 の退行はこの全数差分でしか見つからなかった

## リリース

1. `package.json` の version を上げる → `CHANGELOG.md` に追記
2. コミット → push → `git tag vX.Y.Z && git push origin vX.Y.Z`
3. `publish.yml` が Trusted Publisher (OIDC) で公開

タグと version が一致しないと workflow が停止する。**空 bump を避ける**（規約 §2.8）。
