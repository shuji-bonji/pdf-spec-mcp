# record: name-what-was-read

PDF family の OpenSpec + spec-ids 導入（pdf-agent-stack `docs/specs/31`）のもとでの記録です。書式は計画 §8 です。時刻は JST です。

| 項目 | 記録 |
| --- | --- |
| きっかけ | pdf-agent-stack#47 の試用の所見（#32・F-27・F-30） |
| 版 | OpenSpec 1.14.1 / spec-ids 0.5.0 / pdf-spec-mcp 0.13.0 → 0.14.0（提案。人が決める）/ Claude（claude.ai、モデル claude-opus-5-5）/ 2026-11-06 |
| PR の切り方 | #32 と retryable の固定（同じ版で直すと決めたもの）を 1 本のブランチ `fix/spec-name-what-was-read` にまとめた。提案は人の決定（#32 のコメント、2026-11-06 01:01）の後に書き、チャットでの承認を待たずに実装した。`approved`・`pr` の記入と archive は PR の後 |
| tools/list の比較 | 変更前（main の `3d9032a`）と変更後の `dist` を `pdf-agent-stack/scripts/tools-list-snapshot.mjs` で比べた。差は `list_specs` の description だけ |
| ゲート | check:engines・check・typecheck・typecheck:tests・build・check:public-types・test が Node 22 と Node 20.20.2 で通った。🔴 ただし `src/services/spec-sources.test.ts` の SPEC-SOURCES-003（足した・消した仕様書を次の呼び出しで見る）が、この VM では **main のままでも** 4 回中 4 回落ちる（フォルダーの mtime で走査し直すかを決めていて、同じ 1 ms の中で書くと変化が見えない）。この変更とは関係しない既存の不安定さ。CI（GitHub Actions）での結果は PR で確かめる |
| 維持の手間 | 仕様だけを変えた変更: 0 件 |
| 人が判断した箇所 | (1) 方針（#32 のコメント）。(2) `compare_versions` に `specs`（配列）を返すこと、`spec` を最初の項目に置くこと（提案の「人が判断すること」。未確認） |
| 仕様と実装のずれ | 0 件 |
| テスト | `src/list-specs.test.ts` 2 件と `src/common-output.test.ts` 7 件。変更前の `src/` で 9 件とも落ちた。既存の `src/tools/handlers.test.ts` の 5 件は、応答の先頭に `spec`（`compare_versions` は `specs`）が加わった分だけ期待を直し、pdf-registry の差し替えに `getUnrecognizedFiles` を足した |
| 実検体 | 手元の `pdf-spec/`（18 本）で `list_specs` を呼び、`totalSpecs: 17`・`unrecognizedFiles: ["Deriving_HTML_from_PDF_1-2.pdf"]` を確かめた（試用で見つけた F-27 の形）。`search_spec` を `spec` なしで呼ぶと最初の項目が `spec: "iso32000-2"` |
