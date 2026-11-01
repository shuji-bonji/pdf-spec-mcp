---
approved:
pr:
implementation: required
targets: [spec-sources]
---

# Proposal

## Why

本サーバは、起動している間に `PDF_SPEC_DIR` の中身が変わっても、それを見ません。2026-10-31 に npm の公開版 0.10.0 で次の 3 つを再現しました（`PDF_SPEC_CACHE=off`、ダミーの仕様書の PDF）。

| 場面 | 1 回目 | 2 回目（同じプロセス） | 3 回目（起動し直した後） |
|---|---|---|---|
| 壊れたファイルを正しい 1 ページの PDF に置き換える（`get_structure`） | `INTERNAL_ERROR`（`Invalid PDF structure.`） | 同じエラー | `totalPages: 1` |
| 1 ページの PDF を 3 ページの PDF に差し替える | `totalPages: 1` | `totalPages: 1` | `totalPages: 3` |
| 起動中に `ISO_TS_32002-2022.pdf` を足す | `list_specs` は `ts32001` だけ | `list_specs` は `ts32001` だけ。`get_section(spec: "ts32002")` は `REGISTRY_ERROR`・`retryable: true` | `ts32002` が出る |

- 1 行目（Issue #29）: `pdf-service.ts` の索引の 4 つの `Map`（`sectionIndexMap`・`searchIndexMap`・`requirementsIndexMap`・`definitionsMap`）が、作るのに失敗した Promise を消さない。
- 2・3 行目（Issue #30）: `pdf-registry.ts` の `ensureInitialized` は `PDF_SPEC_DIR` を 1 回だけ `readdir` する。`pdf-loader.ts` の `documentCache`（キーはパス）・索引の 4 つの `Map` と `sectionContentCache`（キーは仕様の ID）は、元の PDF が変わったかを確かめない。
- ディスクの索引キャッシュ（`index-store.ts`）は、内容の SHA-256 と `パス|大きさ|更新時刻` で差し替えを見分ける作りになっているが、その手前のメモリの層が先に答えるので使われない。
- 足した仕様書について `retryable: true` と返すのに、再試行しても結果は変わらない。

## What Changes

- 失敗した結果を覚えない。索引の 4 つの `Map` と登録簿の最初の走査で、失敗した Promise を捨て、次の呼び出しでやり直す。
- 登録簿は、呼び出しのたびに `PDF_SPEC_DIR` を `stat` し、更新時刻が変わっていれば読み直す（足した・消した・名前を変えた仕様書を見る）。仕様書ごとに大きさと更新時刻を持ち、呼び出しのたびに `stat` して比べる。
- 索引・節の本文・読み込んだ文書は、作ったときの仕様書の指紋（パス・大きさ・更新時刻）と今の指紋が違えば、その仕様の分を捨てて作り直す。
- 横断の capability `spec-sources`（`kind: common`）を新しく作り、この 3 つを要求 001〜003 として書く。

### 変わる振る舞い

- 仕様書の読み込み・索引作りに失敗した後で PDF を直すと、同じプロセスへの次の呼び出しで直した PDF から答える。
- 起動中に仕様書を差し替えると、次の呼び出しで差し替えた後の PDF から答える。
- 起動中に `PDF_SPEC_DIR` に仕様書を足すと、次の呼び出しで `list_specs` に出て、その ID で引ける。消すと出なくなる。
- `PDF_SPEC_DIR` がまだ無い・読めない状態で起動した後でフォルダーを作ると、次の呼び出しで読む（これまでは最初の失敗を返し続けた）。

### 変わらない振る舞い

- 仕様書が変わらない間の答え（全ツールの入力と出力）。索引は 1 回だけ作り、使い回す。
- ディスクの索引キャッシュのキーと形式（`INDEX_SCHEMA_VERSION` は上げない）。
- エラーの形（`code`・`next_actions`）。足した仕様書の `retryable: true` は、この変更で事実になる。

### 対象外

- 個々のツールの capability（`get-section` など）の要求。答えの中身は変えない。
- 仕様書の中身が同じで更新時刻だけが変わった場合に索引を作り直さないこと（作り直す。ディスクのキャッシュは内容のハッシュで当たるので、検索と要件の索引は読み込みで済む）。

### 人が判断すること

- 版。振る舞いの修正なので patch（0.10.1）を提案する。
- 呼び出しのたびの `stat` の回数。フォルダー 1 回と、登録された仕様書の数（手元の構成で 17）。仕様書の読み込みや索引作りに比べて小さいので、間引かない。

## Capabilities

### New Capabilities

- `spec-sources`（`kind: common`）: `PDF_SPEC_DIR` にある仕様書の PDF を、どの時点の内容で読むか。個々のツールの入力と出力は各ツールの capability に書き、ここには全ツールに共通する「仕様書の見つけ方と鮮度」だけを書く。

### Modified Capabilities

- なし

## Impact

- `src/services/pdf-registry.ts`: 走査の失敗を覚えない。フォルダーの更新時刻で読み直す。仕様書ごとの指紋（`getSpecVersion(id)`）を返す。
- `src/services/pdf-service.ts`: 索引の 4 つの `Map` を、失敗を捨てる共通の関数に寄せる。仕様書の指紋が変わったら、その仕様の索引・節の本文・読み込んだ文書を捨てる。
- `src/services/pdf-loader.ts`: 読み込んだ文書を 1 つ捨てる `evictDocument(path)` を足す。
- `src/utils/cache.ts`: 条件に合う項目を消す `deleteWhere(predicate)` を足す。
- テスト: `src/services/spec-sources.test.ts`（新規。CI で回る）。
- 文書: CHANGELOG（英語）、CLAUDE.md の落とし穴 5（キャッシュの層）に鮮度の確かめ方を足す。
