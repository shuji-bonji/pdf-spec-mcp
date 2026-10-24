# record: unhandled-role-text

PDF family の OpenSpec + spec-ids 導入（pdf-agent-stack `docs/specs/31`）の Phase 2、pdf-spec-mcp の 1 件目の記録です。書式は計画 §8 です。時刻は JST です。仕様 PR の時点の記録で、実装 PR で書き足します。

| 項目 | 記録 |
| --- | --- |
| 版 | OpenSpec 1.14.1 / spec-ids 0.5.0 / pdf-spec-mcp 0.9.0 → 次の版（人が決める）/ Claude（claude.ai、モデル claude-opus-5-5）/ 2026-10-25 |
| 仕様を書いた時間 | 約 25 分（07:58 に着手し、08:23 に初版起こしと proposal / 差分 spec / design / tasks を commit）。うち全数差分の採り直し（3 種類の dist × 2 仕様）が約 10 分。初版起こしは 3 capability・26 ID・既存テスト 157 件の名前に ID を足した |
| 人が判断した箇所 | (1) Figure の中の文字を拾う（2026-10-25）。(2) 初版起こしを仕様 PR から分け、`spec-init/content-tools` を先に出す（エージェントの提案。`pr-scope` は仕様 PR に `openspec/specs/` の変更を許さない） |
| 仕様と実装のずれ | （実装 PR で書く） |
| エージェントが仕様に無い振る舞いを実装した件数 | （実装 PR で書く） |
| 実装後に仕様を読み返した回数 | （実装 PR で書く） |
| 維持の手間 | （実装 PR で書く） |

## 分かったこと

1. **引き継ぎ書の数字を 1 つ直した。** 「正誤表の要件 31 件に `table` が付く」は、差のあった 3 節（`Additional errata pages` 25 件・`Issue #156` 5 件・`Issue #374` 1 件）の要件の件数の合計で、親と子で同じ要件を重ねていた。要件を 1 件ずつ比べると、`table` が付くのは 6 件（Issue #156 の 5 件と Issue #374 の 1 件。親からも同じ 6 件が見える）。
2. **`Figure` を飛ばす試験版は、飛ばし方が置かれ方で変わっていた。** `visitContainerParagraph` の中でだけ飛ばすので、入れ物の直下の Figure は飛ばし、構造木の根の直下の Figure は拾う。今回の仕様 PDF では差が出なかったが、Figure を拾う決定とは別に、採らない理由になる。
3. **初版起こしで、テスト名の ID は先頭に置く。** `spec-ids pr-scope` は初版起こしのテストの差分を「ID とその後ろの空白を消すと元の行に戻るか」で見る。pdf-reader-mcp の初版起こしのように末尾に `(SPEC-…)` と括弧で足すと、括弧が残って通らない。pdf-reader-mcp の初版起こしは実装 PR（#32）の中の commit だったので（`inspect-structure-unreadable-line` の tasks.md 1.1・1.2）、この検査を受けていない。
4. **変更前の要素は全部残る。** 差のある 24 節すべてで、変更前の要素の並びが変更後の並びの部分列になっていた（段落が間に入るだけ）。`content` の SHA が変わる節でも、既存の要素の書き換えは 0 件。
