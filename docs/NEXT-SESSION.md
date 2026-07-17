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
4. **McpServer + registerTool + zod への移行**（規約 §2.1）— ツール 8 個。**← 次はここ**
   annotations も同時付与（spec は読み取り専用なので全ツール `readOnlyHint: true`）。
   **外部仕様は変えない**。

   ✅ **安全網は用意済み（2026-07-18）**: `src/registry.test.ts` が 8 ツールの名前・必須フィールド・
   受入引数・description・エラー応答（`isError` + `code`）を **MCP プロトコル越しに**固定している。
   `tools/definitions.ts` を直接読まずプロトコルを叩いているので、**A-4 でこのテストを書き換える
   必要はない**（書き換えたら安全網にならない）。そのために `buildServer()` を `src/server.ts` へ
   切り出してある（index.ts は stdio に繋ぐだけ）。
   変異で以下を検出することを確認済み: ツールの公開漏れ / `.optional()` の付け間違えによる
   必須フィールド喪失 / zod スキーマの引数写し漏れ / 構造化エラーを返さず throw する
5. **構造化エラー応答**（規約 §2.3）— `code` / `retryable` / `hint` / `next_actions`。
   `ToolPrerequisiteError`（PDF_SPEC_DIR 未設定）は `next_actions` で設定手順を返すと
   編成 Skill からの利用が堅牢になる
6. **リリース運用** — 空 bump を避ける、README の npx 例に `@latest`

### B. 正典としての機能要件（Issue #8 の範囲外・今回の照合で判明）

詳細は `docs/family-standards-alignment.md` の「正典としての役割強化」節。

- ~~**S-1. ページ跨ぎの表の抽出漏れ**（🔴）~~ — ✅ **完了（2026-07-18）**。
  真因は「セクション境界の帯」だった: ページ範囲が `[page, 次の page - 1]` で決まるため、
  表が最終ページを越えると残りの行が**次セクションの見出しより上**に取り残され、
  どちらのセクションにも属さず消えていた（`trimToSectionStart` が次セクション側から捨てる）。
  セクション**内**の継続は元々 `collectStructTreeTables` が連結できていた。

  > ⚠️ **B-S1 時点の「148 個の表を回復」は誤りだった**（S-5 で判明・訂正済み）。
  > B-S1 の前方走査は最大 5 ページ先までセクション境界を無視して読んでいたため、
  > 148 件のうち **40 件は過剰包含**（表の先頭ページに触れているだけの節が他セクションの
  > ページから行を集めていた。Table 147 は 12 / 12.1 / 12.2 が揃って 18 行を報告したが
  > 持ち主は 12.2 のみ）、さらに **二重計上**もあった（D.3 の 256 行の末尾 13 行 ó〜ÿ は
  > D.4 の表と同一）。S-5 でこれらを是正し、**正味は 92 件**。
  > Table 182 の QuadPoints・Table 166 の CA/BM/Lang といった本来の成果は帯経由で維持。
- ~~**S-2. コーパスの網羅性**~~ — ✅ **完了（2026-07-18）: 照合不能領域を明示**。
  `list_specs` の応答に `coverage`（未収録領域・該当規格・その帰結）を含めた。
  実測で確認した重要な点: PDF/A・PAdES は「ファイルが未配置」ではなく **`SPEC_PATTERNS` に
  パターン自体が無い**ため、PDF を置いても認識されない。塞ぐにはパターン追加 + `COVERAGE_GAPS`
  からの削除が要る。PDF/UA（ISO 14289-1/-2）はコーパスにあるので verify の該当規則は照合可能。
  **コーパスに実際に PDF/A・PAdES を追加するのは別タスク**（著作物の入手が要る）
- ~~**S-3. 引用の正確性を支える機能**~~ — ✅ **実質完了**。`findSimilarSections` が
  「Did you mean: 12.5.6.9」を返し、A-5 で `next_actions`（get_structure を呼べ）も付いた。
  当初の想定（近い候補を返す）は満たされている。これ以上は要求が出てから

### B-S1 から派生した新規項目（2026-07-18 追加）

- **S-4. ヘッダなしの表が分裂する**（🟡 S-5 で顕在化）— `collectStructTreeTables` の連結条件が
  `headers.length > 0` のため、ヘッダ行を持たない表は連結されない。
  B-S1 では継続側を足さないことで回避していたが、**S-5 は帯を内容として正しく採用するので、
  ヘッダなしの表は連結されずに分裂する**（実測 5 セクション。8.7.4.5.5 は 2 → 4 表）。
  内容自体は `get_section` から見えるようになったので後退ではないが、`get_tables` の
  `table_index` は増える。連結には列数や位置での同一性判定が要る（ヘッダが無いので
  ヘッダ一致では判定できない）。対象: 8.4.3.4 / 8.6.8 / 8.7.4.5.5 / 8.7.4.5.6 / 10.6.3
- ~~**S-5. 同じ「帯」が get_section / get_requirements でも落ちている**（🔴）~~ —
  ✅ **完了（2026-07-18）**。412 セクションが内容を落としており、うち 271 が要件文を含んでいた。
  `getSectionContent` が帯を回収し、要件は 364 セクションで計 2974 件増・減少 0。
  副産物として **B-S1 の過剰包含 40 件と二重計上（D.3 と D.4 に同じ 13 行）を是正**した。
  B-S1 以前との正味は「行が増えた表 92・減った表 0」

  > ⚠️ **当時の記述の誤り**: 上に「Table 182 の QuadPoints 行の "shall" は get_requirements からも
  > 見えない」と書いたが、原因の見立てが誤りだった。帯のせいではなく
  > **`extractRequirementsFromContent` が表を一切見ない**（paragraph / list / note のみ）ため。
  > S-5 を入れても表セル内の要件は依然として不可視。下の S-7 を参照

- ~~**S-7. 要件抽出が表を見ていない**（🔴）~~ — ✅ **完了（2026-07-18）**。
  全体インデックスが **5927 → 8666 件（+46%）**、表由来 2739 件・333 セクション。本文は不変。
  `Requirement` に `source` / `table` / `key` を追加（非破壊）。この設計は実測で裏付けられた:
  重複 31 グループのうち **24 が「文が同一でキーが異なる別々の要件」**（Table 51 の
  「A PDF reader shall implicitly reset this parameter」は soft mask と alpha constant の両方に
  掛かる）。`key` が無ければ片方が失われていた。
  `collectStructTreeTables` は `table-collector.ts` へ切り出し、get_tables と規則を共有させた

## 進め方の推奨

1. ~~**A-1（stdout ガード）**~~ — ✅ 完了（2026-07-18）
2. ~~**A-2（Biome）+ A-3（container 削除）**~~ — ✅ 完了（2026-07-18）
3. ~~**B-S1（ページ跨ぎの表）**~~ — ✅ 完了（2026-07-18）
4. ~~**S-5（帯を get_section 側で直す）**~~ — ✅ 完了（2026-07-18）
5. ~~**S-7（要件抽出が表を見ていない）**~~ — ✅ 完了（2026-07-18）
6. **A-4（McpServer + zod）+ A-5（構造化エラー）** — 構造の刷新（外部仕様は不変）**← 次はここ**
7. **B-S2（コーパス明示）+ S-4（ヘッダなしの表の分裂）+ S-2 / S-3**

## 2026-07-18 セッションの記録（A-1〜A-3 + B-S1 + S-5）

- **未リリース**。CHANGELOG は `[Unreleased]` に積んである。A-4/A-5 まで進めてから
  まとめて 1 回で版を上げるのがよい（規約 §2.8「空 bump を避ける」の精神）。
  ただし S-5 は **412 セクションの内容欠落・要件 2974 件**を直す利用者影響の大きい修正なので、
  A-4 を待たず先に minor を切る判断もありうる
- **検証手法（次回も必ず使うこと）**:
  1. **旧実装を `git worktree` で並べてビルドし、全 987 セクションに流して JSON 差分**。
     B-S1 ではこれが 8.7.4.5.5 の退行を捕まえ、S-5 ではこれが
     **B-S1 自身の過剰包含 40 件と二重計上を暴いた**
  2. **dist を変異させて「壊れたら落ちる」ことを確認**。通るだけのテストは証明にならない
- **この 2 つで、自分の書いたテスト・コメントの誤りが毎回見つかっている**。S-5 では
  最初に書いた変異が 2 件とも no-op で、テストの穴（「同一ページ共有」が page 1 の重複を
  素通りさせる）を見逃していた。**変異が捕まらないときは、まず変異が有効かを疑う**
- ユニットテストは `src/services/pdf-service.test.ts`。`PDFSpecService` は registry / loader を
  コンストラクタ注入するので、**vi.mock なしで合成 PDF を組んで実コードを通せる**
- pdfjs は import 時に `DOMMatrix` を要求する。素の node で回すときは
  `globalThis.DOMMatrix ??= class {}` で import を通せる（サンドボックスでは必須）
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
