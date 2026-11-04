# record: family-error-contract

PDF family の OpenSpec + spec-ids 導入（pdf-agent-stack `docs/specs/31`）のもとでの、pdf-spec-mcp の変更の記録です。書式は計画 §8 です。時刻は JST です。

| 項目 | 記録 |
| --- | --- |
| 版 | OpenSpec 1.14.1 / spec-ids 0.5.0 / pdf-spec-mcp 0.11.0 → 0.12.0（人が決めた。`detail.legacyCode` を外すのは 0.13.0）/ Claude（claude.ai、モデル claude-opus-5-5）/ 2026-11-05 |
| きっかけ | pdf-agent-stack#48 で family のエラー応答の規約（`docs/specs/06` §2.3）を書き直した。spec は平らな形を返していたが、引数の誤りが `VALIDATION_ERROR` で、`retryable` が型で任意だった（#33） |
| PR の切り方 | 1 本（計画 §6.3）。ブランチ `fix/family-error-contract`。提案の commit の後、人がチャットで承認し（00:43 ごろ）、同じブランチで実装した |
| 仕様を書いた時間 | 約 10 分（Issue・エラーを作る箇所 13 か所・既存テストの読み込み込み） |
| 実装した時間 | 約 10 分 |
| 人が判断した箇所 | (1) 提案の承認。(2) `REGISTRY_ERROR` の `retryable` を、コードごとに 1 つの値にそろえない（今の値のまま）。(3) 版（0.12.0。旧名を外すのは 0.13.0） |
| 仕様と実装のずれ | 0 件 |
| エージェントが仕様に無い振る舞いを実装した件数 | 0 件。仕様の外の変更は、`RegistryError`・`ContentError` を引数 1 つで作っていた既存テスト 6 件に `{ retryable: true }` を渡したこと（型で必須にしたため。期待値は変えていない） |
| 実装後に仕様を読み返した回数 | 0 回 |
| テスト | `npm test` 380 → 389 件。受入テスト 9 件（`src/error-contract.test.ts`）のうち 5 件が変更前の `src/` で落ち、変更後に通った。変更前から通った 4 件は、0.11.0 がすでに満たしている振る舞い（平らな形・`REGISTRY_ERROR` の `false`・`PREREQUISITE_ERROR` の `false`・名前の変わらないコードに `detail` が無い）。既存の 3 件（`errors.test.ts`・`registry.test.ts`・`validation.test.ts`）の `VALIDATION_ERROR` を `INVALID_ARGUMENT` に直した。Node 22 と Node 20 の両方で 389 件。check:engines・check・typecheck・typecheck:tests・check:imports・build・check:public-types は終了コード 0 |
| tools/list の比較 | 変更前（`474ff3b`）と変更後の `dist` を stdio で起動して比べた。8 ツールとも同じ |
| S6（pdf-agent-stack `eval/e2e`） | spec の 2 件（仕様書のフォルダーが無い → `REGISTRY_ERROR`、宣言に無いキー → SDK の文言のまま）は、このブランチで通った。ただし 0.11.0 でも通っていた。S6 は spec の引数の誤りを試していないので、`INVALID_ARGUMENT` は単体テストでだけ確かめている |
| e2e（tests/e2e） | 仕様 PDF の無い作業環境なので回していない。`VALIDATION_ERROR` を見ているテストは e2e に無い |
| 維持の手間 | 仕様だけを変えた変更: 0 件 |

## 分かったこと

1. **`retryable` が抜けていたのはハンドラの外の 1 経路だけだった。** ハンドラが作る 13 か所はすべて値を持っていた。抜けていたのは `toStructuredError` の `INTERNAL_ERROR` で、型が任意だったので気づけなかった。型で必須にしたので、次に足すエラーで抜ければコンパイルで止まる。
2. **`REGISTRY_ERROR` は「どこで起きたか」で名付けたコードで、同じコードに `retryable` の 2 つの値がある。** 「仕様 ID が登録されていない」は引数の誤りに近い。分け直すかは別に決める（proposal の対象外）。
3. **S6 は spec の引数の誤りを試していない。** spec の 2 件は変更の前から通っていた。S6 に spec の `INVALID_ARGUMENT` の件を足すかは #48 で決める。
