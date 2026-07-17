# family 共通実装規約への整合 — pdf-spec-mcp

**作成日**: 2026-07-17
**規約本体**: `Document-Note/mcps/PDFfamily/specs/06-family-implementation-standards.md`

## 現状の準拠状況

pdf-spec は family 最古参のため、後発（reader / verify）で確立したパターンから最も乖離している。
準拠済み: logger Pattern C、constants/config 集約、version 動的取得、エラー基底クラス（`code` 付き）。

## 残タスク（優先度順）

1. ~~**Biome への移行（ESLint + Prettier 廃止）**~~ — ✅ **完了（2026-07-18）**
   writer と同一の `biome.json`（2.5.4 完全固定）+ scripts を移植。`eslint.config.js` / `.prettierrc` を削除。
   CI / publish workflow に `npm run check` + `npm run typecheck` を組み込んだ。
   `noAssignInExpressions` 違反 3 箇所は等価な形に書き換え（外部挙動は不変・237 テスト green）。

2. ~~**未使用 `container.ts`（DI コンテナ）の決着**~~ — ✅ **完了（2026-07-18）: 削除**
   `createServices()` は無参照だったため削除。実運用は `pdf-service.ts` のシングルトンに一本化。

3. **McpServer + registerTool + zod への移行（規約 §2.1）**
   現在は低レベル `Server` + 手書き `validateXxx`。ツール数 8 で移行コストは中程度。
   移行時に tool annotations（全ツール `readOnlyHint: true` — spec は読み取り専用）も同時付与。
   外部仕様（ツール名・入出力）は変えない。

4. **構造化エラー応答（規約 §2.3）**
   `PDFSpecError` の `code` を活かし、MCP 応答を family 語彙
   （`code` / `retryable` / `hint` / `next_actions`）へ整形する層を追加。
   とくに `ToolPrerequisiteError`（PDF_SPEC_DIR 未設定・仕様 PDF 未配置）は
   `next_actions` で設定手順を返せると、編成 Skill からの利用が堅牢になる。

5. ~~**stdout ガード（規約 §2.4）**~~ — ✅ **完了（2026-07-18）**
   `src/utils/stdout-guard.ts` を追加し、`index.ts` の最初の import にした（writer / verify と同型）。
   reader のインライン版ではなく writer / verify の**独立モジュール版**を採った。ESM は import を
   トップレベル文より先に巻き上げるため、インラインだと依存モジュール評価後に実行されてしまう。
   検証: 実際にサーバを起動して `initialize` / `tools/list` / `tools/call` を投げ、stdout が
   JSON 行のみ（非 JSON 行 0）であることと、`console.log` が stderr に落ちることを確認済み。

6. **リリース運用**: 空 bump（v0.3.2 のような内容変更なしの版上げ）を避ける。
   README の npx 例に `@latest` を付ける（規約 §2.8）。

## ⭐ 正典としての役割強化（2026-07-17 追加・Issue #8 の範囲外）

family 規約 §2.0 に「**実装仕様の判断前に必ず pdf-spec-mcp で ISO 原文を確認する**」が
明文化された（writer の誤判断を条文照合が救った実例が 3 件蓄積したため）。
**pdf-spec は family の正典として、他の 3 MCP + Skill の設計判断の基盤になる**。
この位置づけに伴い、規約整合（Issue #8）とは別に次が要件になる。

### S-1. ページ跨ぎの表の抽出漏れ（🔴 正典としての機能欠損）

**症状**: ISO 32000-2 Table 182（§12.5.6.10 Text markup annotations）の QuadPoints 行が
p.507→508 に跨いでおり、`get_section` / `get_tables` とも **Subtype 行しか返さない**。
表の継続行（次ページ冒頭・キャプション無し）が前ページの表に連結されていない。

**影響**: writer の SPEC-AUDIT で QuadPoints の条文引用ができず、検索スニペット + 周辺条項からの
推定で代替した（結論は正しかったが、**原文で裏を取れなかった**）。正典としては致命的な欠損。
Table 166（注釈の共通エントリ）等、PDF の重要な表は長大でページを跨ぐものが多い。

**対応**: 表の継続を検出して連結する（次ページ先頭が「キャプション無しの表」で、
直前ページ末尾が表で終わっている場合）。

### S-2. コーパスの網羅性（照合の空白）

verify の監査（Issue #5）で判明: **ISO 19005（PDF/A）と ETSI EN 319 142（PAdES）が
コーパスに無い**ため、verify の PDF/A 15 規則と PAdES レベル判定は**条文照合できていない**。
writer の B-8（PDF/A 変換）も同じ壁に当たる。

対応の選択肢: ①該当規格の入手可否を確認して追加 ②「照合不能領域」を `list_specs` の応答や
README で**明示**する（今は「無いこと」が利用者から見えない）。最低限 ② は必要。

### S-3. 引用の正確性を支える機能（要検討）

verify #5 は「clause 引用の誤り（7.1 (10) → 正しくは §7.16）」を自ら発見・報告している。
family 全体が条項番号を根拠として引用する運用になった以上、**「その条項番号が実在するか」を
検証できる手段**（例: `get_section` が存在しない節に対して近い候補を返す）があると、
引用の誤りを早期に検出できる。

## バグ（2026-07-17・writer SPEC-AUDIT で発見）

- **ページ跨ぎの表の行が抽出から欠落する**。実測: ISO 32000-2 Table 182
  （§12.5.6.10 Text markup annotations）の QuadPoints 行が p.507→508 に跨いでおり、
  `get_section` / `get_tables` とも Subtype 行しか返さない。表の継続行
  （次ページ冒頭・キャプション無し）を前ページの表に連結する処理が必要。
  条文照合ワークフロー（writer の docs/SPEC-AUDIT.md）で原文引用ができず、
  検索スニペット + 周辺条項からの推定で代替した。

## 出力パイプライン（pdf-publish Skill）での役割

`specs/07-pdf-publish-skill.md` にて、spec は任意参加: verify が違反を返した際の
**仕様根拠引用**（`get_section` / `get_requirements` で ISO 32000 / 14289 の clause 本文を添える）。
新規実装は不要。
