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

### 1. セクション境界の「帯」（B-S1 → S-5 / 2026-07-18）

セクションのページ範囲は outline から `[page, 次セクションの page - 1]` として決まる。
最終ページを越えて溢れた分は**次セクションの先頭ページの、見出しより上**に取り残される。
この帯はどのセクションにも属さない — 自分の範囲外であり、かつ `trimToSectionStart` が
次セクションの内容から捨てるため、**丸ごと消える**。ISO 32000-2 では **412 セクション**が
内容を落としており、**271 が要件文**を含んでいた。

`getSectionContent` が帯を回収する（`adoptOrphanedStrip` → `extractOrphanedStrip`）。
これで `get_section` / `get_requirements` / `get_tables` が一度に直るので、
**表専用の境界処理は要らない**（B-S1 の `collectTrailingTableRows` は S-5 で撤去した）。

**二重計上を防ぐ 2 つの条件を弱めないこと**:

1. **採用は `trimToSectionStart` の正確な裏返し**。両者が同じ `findSectionHeadingIndex` で
   判定する。見出しが見つからないとき（69 セクション）は次セクションがページ全体を保持して
   いるので、**あえて採用しない**
2. **`next.page === endPage + 1`**（構造条件）。同一ページを共有する場合（`endPage === page`）の
   `endPage + 1` は継ぎ目ではなく次セクションの領分。読むと**自セクションの内容が重複する**

> ⚠️ B-S1 の「148 個の表を回復」は**誤り**だった。前方走査が最大 5 ページ先まで境界を無視して
> 読んでいたため、40 件は過剰包含（Table 147 を 12 / 12.1 / 12.2 が揃って報告。持ち主は 12.2 のみ）、
> さらに D.3 と D.4 に同じ 13 行を**二重計上**していた。S-5 で是正し正味 92 件。
> **全数差分がなければ気づけなかった。**

帯は **search_spec にも同じ形で現れていた**（S-8 / 2026-07-19 修正）。索引はページ単位だった
ため、帯は必ず次セクションに誤帰属し、さらに**同一ページで複数セクションが始まると最後の
1 つ以外は検索から不可視**だった（357 セクション）。`extractPageSegments` が
**同じ `findSectionHeadingIndex`** でページを分割する。見出しの判定規則を変えるときは
trimToSectionStart / extractOrphanedStrip / extractPageSegments の 3 つが同じ関数を
通っていることを崩さないこと。

### 1b. `walkStructTree` は未知コンテナ直下の content 葉を落とす

TOC / TOCI / Link / Span のような未処理ロールは再帰はされるが、**その直下の content 葉は
どこにも収集されない**。目次・正誤表（Issue #NNN）・扉ページは要素経由だと文字がほぼ出ない。
このため `extractPageSegments` は**見出しが 1 つも見つからないページを生テキストで索引**する
（このフォールバックを外すと Contents / Issue 系がインデックスから消える。変異テストで確認済み）。
get_section / get_requirements にも同じ脱落が及ぶが、影響は前付・正誤表のみで本文は無事。

### 2. キャッシュされた content を参照で外に出さない（0.4.0 の退行）

`sectionContentCache` が保持する `ContentElement` の配列を、そのまま結果に載せてはいけない。
`collectStructTreeTables` が `rows: element.rows` と参照で共有したまま、連結時に同じ配列へ
`push` していたため、**キャッシュされたページ自体が書き換わり、引くたびに表が膨らんだ**
（Table 182 が 6 → 7 行、`get_requirements` が 6 → 15 件）。
全ツールは `readOnlyHint` / `idempotentHint` を宣言しているのに、**呼び出し順と回数で
結果が変わっていた**。`content` を読む処理は、返す配列を必ずコピーすること。

**見逃した理由**: ユニットテストも e2e も**各ツールを 1 回ずつしか呼んでいなかった**。
純粋関数のつもりのものがキャッシュされた入力を破壊していても気づけない。
npx で公開版を叩いて初めて露見した。
歯止め: `table-collector.test.ts`（content を変更しない / 何度呼んでも同じ / 結果を汚しても
届かない）と e2e の X-13〜X-15（全ツールの冪等性）。

### 2b. ページ共有の分割と、輪切りが生む「実在しない行」（S-9 / 2026-07-19 修正）

セクションの内容は 3 つの操作で**ページを分割**して決まる。すべて同じ
`findSectionHeadingIndex` を通る（弱めないこと）:

1. `trimToSectionStart` — 先頭ページの自見出しより前を捨てる
2. `extractOrphanedStrip` — 跨ぎ先ページの帯を回収する（S-5）
3. `trimAfterNextSectionStart` — **最終ページを次セクションと共有するとき**
   （`next.page === endPage`）、次の見出し以降を捨てる（S-9）。これが無いと
   次セクションの表がキャプション付きの**不完全な重複**として前セクションに残る
   （8.4.3.3 の Table 54 = Miter 1 行だけ、が実例）

また、ページ跨ぎの Table 要素をページで輪切りにすると「テキストを持たない TR」が
`["","",""]` 行になって現れる。**構造木に全セル空の TR は存在しない**（pdf-lib ダンプ +
reader M-8 で確認）ので、`collectStructTreeTables` は全セル空行を採らない。

この分割の帰結として、**前文を持たない親セクションは `[heading]` のみを返す**
（7.3.4 は見出しの直後に 7.3.4.1 が始まる。旧実装が返していた「同一ページ上の子の断片」は
誤った部分表示だった）。テストで「paragraph があるはず」と書くときは葉セクションを使うこと。

🔴 **差分基準は基準線のバグを継承する**。S-4 の受け入れ「非空セルの喪失・追加ゼロ」は
旧実装との差分だったため、空行の捏造（非空でないセル）と昔からの二重帰属を素通しした。
抽出の正しさは差分ではなく **oracle**（pdf-lib の構造木ダンプ / 独立実装の reader M-8）で
確かめること。全消えの検査には「除去された要件それぞれに同一文の生存者がいるか」の
機械検証が使える（S-9 で 1483 件全部を確認した手法）。

### 3. 表の連結は 2 形態ある（S-4 / 2026-07-19 修正）

`collectStructTreeTables` の連結は (1) **ヘッダ再掲の一致**（ISO はページ跨ぎでヘッダ行を
再掲する。挟まる要素があっても連結）と (2) **実質ヘッダなしの隣接断片**（S-4）:
キャプションなし・**直前に取り込んだ `table` 要素の直後**・ヘッダが無いか全セル空白・
**列数が前の表と一致**。空ヘッダ `["","",""]` は画像のみの行が空文字で抽出されたもので、
これが挟まると (1) の鎖が切れて Table 126 は 7 分裂していた。

**(2) の隣接・列数の条件を弱めないこと**。段落を挟むヘッダなしの表は**別の表**
（8.7.4.5.5 の Mesh 2、8.7.4.5.6 の三角形定義）であり、連結すると過剰包含になる。
また連結時も行を**コピー**すること（参照 push は下記 2. のキャッシュ汚染の再来。
0.4.1 の修正は push 時のみで、連結パスに穴が残っていた）。
変更時は全数差分で「非空セルの喪失・追加ゼロ」を機械的に示す。

### 4. 要件は表の中にもある（S-7 / 2026-07-18 修正）

`extractRequirementsFromContent` は paragraph / list / note しか走査せず、**表のセルを無視していた**。
ISO の表は要件語の宝庫で、全体インデックスは **5927 → 8666 件（+46%）**に増えた（表由来 2739 件）。

- 表は `collectStructTreeTables`（`table-collector.ts`）で再構成してから走査する。
  キャプションの帰属が `get_tables` と一致し、ページを跨いで分割された表も 1 つとして扱われる
- **text 由来の表（`detectTablesFromText`）は走査しない。** あれは paragraph から組み立てられており、
  本文の走査が既に読んでいるため**二重計上になる**（変異で実証済み: 足すと 8666 → 11405 に膨らむ）
- `Requirement` の `source` / `table` / `key` を落とさないこと。文脈がないと
  「... shall be Highlight, ...」がどのキーの制約か分からない。実測で**重複 31 グループ中 24 は
  「文が同一でキーが異なる別々の要件」**だった

> ⚠️「QuadPoints の shall が get_requirements から見えないのは帯（S-5）のせい」という見立ては
> **誤り**だった。真因はこれ。原因の見立てを引き写さず、実際に経路を追うこと。

### 5. 「LRU を検証している」テストは LRU に届いていなかった（2026-07-18 是正）

`get_structure` は `getSectionIndex` のメモ（spec ごと・**上限なし・無期限**）を引くため、
**2 回目以降は loader を一切呼ばない**。e2e の X-1〜X-3 はこれを通してドキュメント LRU を
検証したつもりだったが、実際には section-index メモを測っていただけで、
**LRU が完全に壊れていても緑のまま**だった（`pdf-loader.test.ts` にも LRU テストは無かった）。

教訓: **キャッシュの層が 2 つある**（上位 = section-index メモ、下位 = ドキュメント LRU）。
上位を通すテストは下位に届かない。ドキュメント LRU は `DocumentLoaderService` に
`DocumentSource` を注入して直接検証する（`pdf-loader.test.ts`）。

### 6. stdout を汚すのは `console.log` と `console.info`（`warn` ではない）

Node では **`console.log` / `console.info` が stdout**、`warn` / `error` は stderr。
pdfjs-dist v5 の実際の経路は `warn()` → `console.warn`（stderr・**stdout は汚さない**）、
`info()` → `console.info`（stdout）、`deprecated()` → `console.log`（stdout）。
「pdfjs の warn が stdout を汚す」は**誤り**なので引き写さないこと。
`src/utils/stdout-guard.ts` が log / info / warn を stderr へ転送する。
ESM は import を巻き上げるため、ガードは `index.ts` の**最初の import** でなければ意味がない。

## テスト

```bash
npm test                 # ユニット（仕様 PDF 不要）
npm run test:e2e         # 実 PDF（PDF_SPEC_DIR=./pdf-spec）
npm run typecheck        # src のみ（tsconfig.json が **/*.test.ts を除外している）
npm run typecheck:tests  # ★ テストを含む型検査。サンドボックスからでも実行可
npm run check:imports    # import 順（biome なしで動く。サンドボックスからでも実行可）
```

> ⚠️ **`npm run typecheck` はテストを見ない**（`tsconfig.json` の `exclude`）。エクスポートを
> 削除・改名しても、それを参照するテストの型エラーは**出ない**。A-4 で実際にこれを踏み、
> 旧バリデータを消したまま `validation.test.ts` を放置して 39 件落とした。
> **公開 API を触ったら `npm run typecheck:tests` を必ず実行する**（vitest と違い素の node で動く）。

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
- **ツールは必ず複数回・順序を変えて呼ぶ**。1 回ずつしか呼ばないテストは、キャッシュ破壊も
  順序依存も検知しない（0.4.0 がそれで出た）。リリース後は
  **npx で公開版を隔離環境に落として叩く**（`npm init -y` した空ディレクトリで
  `npm install @shuji-bonji/pdf-spec-mcp@latest`）。ホストの node_modules と混ざらず、
  linux 版の `@napi-rs/canvas` が入るのでサンドボックスでも pdfjs が動く

## リリース

1. `CHANGELOG.md` の `## [Unreleased]` を `## [X.Y.Z] - YYYY-MM-DD` に確定する
   （`[Unreleased]` の見出しだけ残すのは可。中身が残っていると publish が止まる）
2. `package.json` の version を上げる
3. コミット → push → `git tag vX.Y.Z && git push origin vX.Y.Z`
4. `publish.yml` が Trusted Publisher (OIDC) で公開

`publish.yml` が止める事故（規約 §2.8）:

| 検査 | 防ぐ事故 |
|---|---|
| タグ == `package.json` の version | タグだけ先行して版上げを忘れる |
| `## [X.Y.Z]` の節がある | CHANGELOG の書き忘れ |
| **その節に中身がある** | **空 bump**（v0.3.2 がこれだった。見出しだけでは通らない） |
| `[Unreleased]` が空 | 書いたが移し忘れ、無記載のまま出る |

`npx` の例には **`@latest` を付ける**。バージョン指定なしの `npx -y <pkg>` は最初にキャッシュした
ものを使い続ける（`-y` は確認を省くだけで更新は見ない）。README 4 箇所と `.claude-plugin/plugin.json`。

**リリースしたら必ず公開版を叩く。** テストが全緑でも足りない — 0.4.0 のキャッシュ破壊は
ここでしか見つからなかった（結果 unpublish になった）。隔離環境を作って MCP 越しに検証する:

```bash
mkdir /tmp/verify && cd /tmp/verify && npm init -y
npm install @shuji-bonji/pdf-spec-mcp@latest
# PDF_SPEC_DIR を渡して spawn し、同じツールを 2〜3 回呼ぶ
```

ホストの `node_modules` と混ざらず、**linux 版の `@napi-rs/canvas` が入るのでサンドボックスでも
pdfjs が動く**。同じツールを複数回・順序を変えて呼ぶこと（1 回では冪等性の破れが出ない）。

> `[0.4.0]` は unpublish 済み。CHANGELOG に節は残してあるが `(unpublished)` と明記している。
> **unpublish は最後の手段**（依存している人がいれば壊れる）。公開前の検証で防ぐこと。
