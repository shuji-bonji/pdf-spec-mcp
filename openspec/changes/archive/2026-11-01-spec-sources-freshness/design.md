# Design

## キャッシュの層と、それぞれの鮮度の確かめ方

| 層 | 場所 | キー | 0.10.0 | この変更 |
|---|---|---|---|---|
| 登録簿 | `pdf-registry.ts` `registry` | 仕様の ID | `readdir` は最初の 1 回だけ。走査の失敗も覚える | 呼び出しのたびにフォルダーを `stat`。更新時刻が変われば読み直す。仕様書ごとに `stat` して指紋（大きさ・更新時刻）を持つ。走査の失敗は覚えない |
| 読み込んだ文書 | `pdf-loader.ts` `documentCache` | パス | 確かめない | 指紋が変わったら `evictDocument(path)` で捨てる |
| 索引 | `pdf-service.ts` の 4 つの `Map` | 仕様の ID | 確かめない。失敗した Promise も消さない | 指紋が変わったら捨てる。失敗した Promise は消す（`memo`） |
| 節の本文 | `pdf-service.ts` `sectionContentCache` | `${id}:${節}:${ページ}` | 確かめない | 指紋が変わったら、その仕様の項目を `deleteWhere` で捨てる |
| ディスクの索引 | `index-store.ts` | 内容の SHA-256・版 | 確かめている（`パス|大きさ|更新時刻` ごとにハッシュを取り直す） | 変えない |

## 指紋の受け渡し

- 登録簿の `getSpecVersion(id)` は `${path}|${size}|${mtimeMs}`（`stat` できないときは `${path}|unreadable`）を返す。
- pdf-service は公開の入口（`getSectionIndex`・`getSectionContent`・`searchSpec`・`getRequirements`・`getDefinitions`・`getTables`）をすべて `resolveFresh` に通す。`resolveFresh` は、仕様の ID ごとに「索引を作ったときの指紋とパス」を `builtFrom` に持ち、今の指紋と違えば `forget(id, 前のパス)` してから進む。
- 登録簿の指紋を新しくするのは、各ツールの入口で必ず呼ばれる `ensureRegistryInitialized`（`handlers.ts`）。pdf-service は登録簿の `stat` を待たない（同期のまま）。

## 配線を型で必須にする

`defaultPdfService` は、登録簿と読み込みを関数の組（`{ loadDocument, reloadDocument, getOutlineWithPages }`）で受け取る。実装の途中で `evictDocument` を足したが、この組に渡し忘れた。単体テストの偽の読み込みは `evictDocument` を持っていたので通り、`dist` を stdio で起動して差し替えを試したときにだけ「差し替えても 1 ページのまま」と出た。注入の型で `getSpecVersion` と `evictDocument` を必須にし、渡し忘れを `npm run typecheck` で止める。

## ライブラリの制約

- `stat` の更新時刻の精度はファイルシステムによる（ext4・APFS はナノ秒）。同じ大きさのファイルを同じ時刻の刻みの中で書き換えると、差し替えを見逃す。仕様書を人が差し替える場面では起きない。
- フォルダーの更新時刻は、中のファイルを上書きしても変わらない（名前の追加・削除・変更で変わる）。上書きは仕様書ごとの `stat` が見る。
- pdfjs-dist v5 の `PagesMapper`（落とし穴 5・7）の制約は変えない。差し替えで文書を捨てた後は、次の読み込みが新しい文書になる。

## 仕様の制約

- ISO 32000 には関わらない（仕様書の PDF をどの時点の内容で読むかは本サーバの実行環境の話）。
