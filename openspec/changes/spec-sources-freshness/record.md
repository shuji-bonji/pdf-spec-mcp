# record: spec-sources-freshness

PDF family の OpenSpec + spec-ids 導入（pdf-agent-stack `docs/specs/31`）の Phase 2、pdf-spec-mcp の 2 件目の記録です。書式は計画 §8 です。時刻は JST です。

| 項目 | 記録 |
| --- | --- |
| 版 | OpenSpec 1.14.1 / spec-ids 0.5.0 / pdf-spec-mcp 0.10.0 → 次の版（人が決める。patch の 0.10.1 を提案）/ Claude（claude.ai、モデル claude-opus-5-5）/ 2026-11-01 |
| きっかけ | 2026-10-31 の「書いた直後の読み取りの鮮度の確認」（pdf-agent-stack-docs `reviews/2026-10-31-state-freshness-report.md`）で見つけ、Issue #29・#30 にした。本人の指示（2026-11-01「全ての Issue を消化してほしい」）で着手。2 件は同じ層（仕様書の見つけ方と鮮度）の話なので 1 つの変更にまとめた |
| 仕様を書いた時間 | 約 10 分（proposal / 差分 spec / design / tasks）。新しい共通 capability `spec-sources`（`kind: common`）に 001〜003 を ADDED で書いた |
| 人が判断した箇所 | (1) 版。(2) 呼び出しのたびの `stat` の回数（フォルダー 1 回と、登録された仕様書の数）を間引かないこと（proposal の「人が判断すること」）。(3) `approved`・`pr` の記入と archive |
| 仕様と実装のずれ | 0 件。受入テスト 7 件のうち 6 件は修正の前に落ち（失敗の記憶・走査の記憶・差し替えの無視・`getSpecVersion` が無い・追加と削除の無視）、7 件目（変わらなければ読み直さない）は修正の前も後も通る |
| エージェントが仕様に無い振る舞いを実装した件数 | 0 件 |
| 実装後に仕様を読み返した回数 | 1 回。design.md に「配線を型で必須にする」の節を足した（下の「分かったこと」の 1） |
| 維持の手間 | 仕様だけを変えた変更: 0 件 |
| 全数差分（`golden:check`） | pdf17 823 節・iso32000-2 987 節 × 3 ツールで差 0 件（要件 23,327 / 25,068 件・表 1,432 / 1,681 は基準線と同じ）。答えの中身は変えていない |
| e2e | `npm run test:e2e`（作業環境に 19 冊の仕様書を写して回した）は 251 件中 250 件が通った。落ちた 1 件は P-6（索引を一から作る `search_spec` が 15 秒以内）で、16.4〜16.8 秒。変更前の main でも 16.5〜17.9 秒で落ちたので、作業環境（2 CPU）の速さによる。手元の Mac では 10-25 に 251 件すべて通っている |
| 起動したままの確認 | ビルドした `dist` を stdio で起動し、`PDF_SPEC_CACHE=off`・ダミーの仕様書で 3 つの場面を試した。壊れた PDF → 正しい PDF: `INTERNAL_ERROR` → `totalPages: 1`。1 ページ → 3 ページ: `1` → `3`。仕様書を足す: `list_specs` に `ts32002` が出る。3 つとも 2 回目が起動し直した 3 回目と同じ答えになった。pdf-agent-stack の `eval/e2e` の S5（3 件）も、この `dist` で通り、公開版 0.10.0 では落ちる |
| テストの数 | `npm test` 373 → 380 件（+7）。check:engines・check・check:imports・typecheck・typecheck:tests・build・check:public-types はすべて終了コード 0 |

## 分かったこと

1. **単体テストが通っても、既定の配線が漏れていた。** `defaultPdfService` は読み込みを関数の組（`{ loadDocument, reloadDocument, getOutlineWithPages }`）で受け取る。`evictDocument` を足したときにこの組へ渡し忘れ、注入の型で任意（`?`）にしていたのでコンパイルも通った。単体テストの偽の読み込みは `evictDocument` を持っていたので 7 件とも通った。`dist` を stdio で起動して差し替えを試したときにだけ「差し替えても 1 ページのまま」と出た。注入の型で `getSpecVersion` と `evictDocument` を必須にし、`cli.ts`・e2e の 12・単体テストの偽物にも渡した。これで、渡し忘れは `npm run typecheck` で止まる。
2. **層ごとに鮮度を確かめないと、下の層の確かめ方は使われない。** 0.10.0 でも、ディスクの索引キャッシュ（`index-store.ts`）は内容の SHA-256 と `パス|大きさ|更新時刻` で差し替えを見分けていた。その手前のメモリの層（索引の `Map`・`documentCache`・`sectionContentCache`）が仕様の ID とパスだけをキーにしていたので、一度載った後はディスクの層まで届かなかった。CLAUDE.md の落とし穴 5（キャッシュの層が 2 つある）の続きとして 5b に書いた。
3. **エラーの `retryable: true` は振る舞いの約束になる。** 見つからない仕様の ID に `retryable: true` を返しながら、登録簿は 1 回しか走査しなかった。003 の本文にこの理由を書いた。pdf-reader-mcp#34（「入れて、もう一度呼んで」）と同じ形。
