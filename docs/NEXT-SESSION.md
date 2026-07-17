# pdf-spec-mcp 整備 — 次セッションの作業指示

**作成日**: 2026-07-17（writer のセッションからの引き継ぎ）
**目的**: pdf-spec-mcp を「family の正典」として実務に耐える水準へ整備する

---

## なぜ今 spec を整備するのか（背景）

2026-07-17、writer の Tier C 検討中に**条文照合の価値と限界が同時に露呈**した:

- ✅ **価値**: 条文照合で shall 違反を 5 件発見・是正（writer v0.9.1 / v0.9.2）。
  さらに「リフローは不可能」という**私の誤った断定を条文が覆した**（§14.8.1 が
  reflow を Tagged PDF の意図された用途と明記していた）。危うく機能を捨てるところだった
- ⚠️ **限界**: ページ跨ぎの表が抽出できず、Table 182 の QuadPoints 行を**原文で引けなかった**。
  PDF/A・PAdES はコーパスに無く、verify の該当規則は照合不能

この結果、family 規約 §2.0 に「**実装仕様の判断前に必ず pdf-spec-mcp で ISO 原文を確認する**」が
明文化された（`Document-Note/mcps/PDFfamily/specs/06-family-implementation-standards.md`）。
**spec の品質が family 全体の設計判断の質を決める**という構造になったため、優先度が上がった。

## 作業項目

### A. Issue #8（family 共通実装規約への整合）

[Issue #8](https://github.com/shuji-bonji/pdf-spec-mcp/issues/8) の 6 項目。優先度順:

1. ~~**stdout ガード**（規約 §2.4）~~ — ✅ **完了（2026-07-18）**。`src/utils/stdout-guard.ts` を
   追加し `index.ts` の最初の import に。writer / verify と同型の独立モジュール版を採用
   （reader のインライン版は ESM 巻き上げの問題があるため踏襲しなかった）
2. ~~**Biome への移行**（ESLint + Prettier 廃止）~~ — ✅ **完了（2026-07-18）**。2.5.4 完全固定。
   CI / publish に `npm run check` + `npm run typecheck` を組み込み済み
3. ~~**未使用 `container.ts` の決着**~~ — ✅ **完了（2026-07-18）: 削除**
4. **McpServer + registerTool + zod への移行**（規約 §2.1）— ツール 8 個。**← ここから再開**
   annotations も同時付与（spec は読み取り専用なので全ツール `readOnlyHint: true`）。
   **外部仕様は変えない**（writer v0.7.0 の移行時は `registry.test.ts` でスナップショット固定した。同じ手が使える）
5. **構造化エラー応答**（規約 §2.3）— `code` / `retryable` / `hint` / `next_actions`。
   `ToolPrerequisiteError`（PDF_SPEC_DIR 未設定）は `next_actions` で設定手順を返すと
   編成 Skill からの利用が堅牢になる
6. **リリース運用** — 空 bump を避ける、README の npx 例に `@latest`

### B. 正典としての機能要件（Issue #8 の範囲外・今回の照合で判明）

詳細は `docs/family-standards-alignment.md` の「正典としての役割強化」節。

- **S-1. ページ跨ぎの表の抽出漏れ**（🔴）— Table 182 の QuadPoints 行（p.507→508）が取れない。
  表の継続行を前ページの表に連結する処理が要る。**正典としては致命的**
  （Table 166 等、PDF の重要な表は長大でページを跨ぐ）
- **S-2. コーパスの網羅性** — ISO 19005（PDF/A）と ETSI EN 319 142（PAdES）が無く、
  verify の PDF/A 15 規則・PAdES 判定は照合不能。最低限「照合不能領域」を明示する
- **S-3. 引用の正確性を支える機能**（要検討）— 存在しない節への `get_section` に近い候補を返す等

## 進め方の推奨

1. ~~**A-1（stdout ガード）**~~ — ✅ 完了（2026-07-18）
2. ~~**A-2（Biome）+ A-3（container 削除）**~~ — ✅ 完了（2026-07-18）
3. **B-S1（ページ跨ぎの表）** — 正典としての本丸。writer/verify の照合品質に直結 **← 次はここ**
4. **A-4（McpServer + zod）+ A-5（構造化エラー）** — 構造の刷新（外部仕様は不変）
5. **B-S2（コーパス明示）**

## 2026-07-18 セッションの記録（A-1〜A-3）

- **未リリース**。CHANGELOG は `[Unreleased]` に積んである。A-4/A-5 まで進めてから
  まとめて 1 回で版を上げるのがよい（規約 §2.8「空 bump を避ける」の精神）
- 検証済み: `npm run check` / `typecheck` / `npm test`（237 passed）/ `build` すべて green。
  加えて**実際にサーバを起動**して stdout が JSON 行のみであることを確認した
- A-4 に着手する際の注意: `biome.json` の `organizeImports` は side-effect import
  （`import './utils/stdout-guard.js'`）を先頭に保つことを確認済み。ただし index.ts を
  触るときは **build 後の `dist/index.js` で import 順が保たれているか**を毎回見ること
- A-4 の非破壊性は writer 同様 `tests/registry.test.ts` 相当のスナップショットで担保するとよい
  （現状 spec には未整備。移行前に先に書くこと）

## 参照すべき先行実装

| やりたいこと | 参照先 |
|---|---|
| stdout ガード | `pdf-reader-mcp/src/utils/stdout-guard.ts`（または verify） |
| Biome 設定 | `pdf-writer-mcp/biome.json` + package.json の scripts（2.5.4 固定） |
| McpServer + zod 移行 | `pdf-writer-mcp` v0.7.0 の `server.ts` / `tools/definitions.ts` / `utils/validation.ts`。
  **移行の非破壊性は `tests/registry.test.ts` のスナップショットで担保**した |
| 構造化エラー | `pdf-writer-mcp/src/errors.ts`（`code` / `hint` / `next_actions` / `retryable` + NEXT_ACTIONS プリセット） |
| 規約本体 | `Document-Note/mcps/PDFfamily/specs/06-family-implementation-standards.md` |

## この作業の後に控えているもの（着手しない・文脈として）

- writer **B-10**（🔴 ページ操作が StructTreeRoot / XMP / 添付を黙って破棄。`docs/TASKS.md`）
- reader **#12**（Biome 版不整合）→ **#13 High-1**（Type0 埋め込み誤判定）
- **M-8**（`extract_structured_text`。`Document-Note/mcps/PDFfamily/specs/08-structured-text-and-reflow.md`）
- verify **#4**（AI 判定の非決定性 = 「判定はコード、解説は LLM」への分担変更提案）
