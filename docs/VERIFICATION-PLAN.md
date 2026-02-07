# pdf-spec-mcp 全機能検証計画書

**作成日**: 2026-02-07
**対象バージョン**: 0.2.0
**目的**: 全ユースケースを網羅した厳密な機能検証と、再利用可能なテストスイートの構築

---

## 1. 検証の目標

### 1.1 現状のテストカバレッジ

| 種別 | 件数 | カバー範囲 | 限界 |
|------|------|------------|------|
| ユニットテスト (vitest) | 191 | 各関数の単体ロジック | モック中心、実PDF未使用 |
| 統合テスト (phase3-verify.ts) | 33 | 8ツール × 代表的PDF | 5-6仕様のみ、網羅性不足 |

### 1.2 本検証で達成すること

1. **全17仕様 × 全8ツール** の組み合わせ網羅テスト
2. **各ツール固有のエッジケース** の厳密検証
3. **クロスカット懸念** の検証（LRU、PagesMapper、パフォーマンス）
4. **再利用可能なスクリプト** の構築（CI/リリース前に毎回実行可能）
5. **パフォーマンスベースライン** の記録（将来の回帰検知用）

---

## 2. テストスイート設計

### 2.1 ディレクトリ構成

```
tests/
  e2e/                          # End-to-End テスト（実PDFを使用）
    setup.ts                    # 共通セットアップ（レジストリ初期化等）
    helpers.ts                  # テストヘルパー（結果検証、タイムアウト等）
    01-registry.test.ts         # レジストリ・Discovery
    02-list-specs.test.ts       # list_specs ツール
    03-get-structure.test.ts    # get_structure ツール（全17仕様）
    04-get-section.test.ts      # get_section ツール
    05-search-spec.test.ts      # search_spec ツール
    06-get-requirements.test.ts # get_requirements ツール
    07-get-definitions.test.ts  # get_definitions ツール
    08-get-tables.test.ts       # get_tables ツール
    09-compare-versions.test.ts # compare_versions ツール
    10-cross-cutting.test.ts    # LRU、PagesMapper、キャッシュ
    11-performance.test.ts      # パフォーマンスベースライン
  e2e/vitest.config.ts          # E2E用vitest設定（タイムアウト長め）
```

### 2.2 実行方法

```bash
# ユニットテスト（既存、高速）
npm test

# E2E テスト（実PDF使用、低速）
PDF_SPEC_DIR=./pdf-spec npx vitest run --config tests/e2e/vitest.config.ts

# 特定ファイルのみ
PDF_SPEC_DIR=./pdf-spec npx vitest run tests/e2e/05-search-spec.test.ts
```

---

## 3. テストケース詳細

### 3.1 レジストリ・Discovery (`01-registry.test.ts`)

| # | テストケース | 検証内容 |
|---|------------|----------|
| R-1 | 全17仕様の検出 | `discoverSpecs()` が17件返す |
| R-2 | 各specIdの一意性 | 重複IDがない |
| R-3 | resolveSpecId(undefined) | `'iso32000-2'` を返す |
| R-4 | resolveSpecId('pdf17') | `'pdf17'` を返す |
| R-5 | resolveSpecId('unknown') | エラーをスロー |
| R-6 | getSpecPath の全specId | 17件全てが有効なファイルパスを返す |
| R-7 | isSpecAvailable | 全17 specIdで `true`、`'nonexistent'` で `false` |
| R-8 | enrichSpecInfo 反映 | get_structure後にpages/outlineEntriesが非null |

---

### 3.2 list_specs (`02-list-specs.test.ts`)

| # | テストケース | 検証内容 |
|---|------------|----------|
| L-1 | フィルタなし | totalSpecs=17 |
| L-2 | category=standard | totalSpecs=4, specIdが正しい |
| L-3 | category=ts | totalSpecs=5 |
| L-4 | category=pdfua | totalSpecs=2 |
| L-5 | category=guide | totalSpecs=3 |
| L-6 | category=appnote | totalSpecs=3 |
| L-7 | 無効なcategory | totalSpecs=0（エラーではなく空） |
| L-8 | 各specの必須フィールド | id, title, filename, category, description が全て非空 |

---

### 3.3 get_structure (`03-get-structure.test.ts`)

**全17仕様に対して実行する検証マトリクス：**

| # | テストケース | 対象 | 検証内容 |
|---|------------|------|----------|
| S-1 | 基本構造取得 | 全17仕様 | title, totalPages > 0, totalSections > 0 |
| S-2 | セクション構造の妥当性 | 全17仕様 | 各セクションの page ≥ 1、sectionNumber が string \| null |
| S-3 | max_depth=1 | iso32000-2 | children が全て空配列 |
| S-4 | max_depth=2 | iso32000-2 | depth=0の子はあり、depth=1の子は空 |
| S-5 | max_depth 省略 | iso32000-2 | 完全なツリー（children がネスト） |
| S-6 | max_depth 境界値 | - | max_depth=0→エラー、max_depth=11→エラー |
| S-7 | デフォルトspec | - | specなし → iso32000-2 |
| S-8 | enrichSpecInfo反映 | 全17仕様 | get_structure後にSpecInfoのpages/outlineEntriesが更新される |

**仕様別の期待値テーブル（S-1で使用）：**

| specId | 期待title(部分一致) | 期待pages範囲 | 期待sections範囲 |
|--------|-------------------|--------------|-----------------|
| iso32000-2 | "PDF 2.0" | 900-1100 | 800-1200 |
| iso32000-2-2020 | "PDF 2.0" | 900-1100 | 800-1200 |
| pdf17 | "PDF 1.7" | 700-800 | 700-1000 |
| pdf17old | "PDF Reference" | 1200-1400 | 500-1500 |
| ts32001 | "32001" | 5-30 | 5-50 |
| ts32002 | "32002" | 5-30 | 5-50 |
| ts32003 | "32003" | 5-30 | 5-50 |
| ts32004 | "32004" | 5-30 | 5-50 |
| ts32005 | "32005" | 5-50 | 5-100 |
| pdfua1 | "PDF/UA" \| "14289" | 10-50 | 10-100 |
| pdfua2 | "PDF/UA-2" \| "14289-2" | 30-80 | 100-250 |
| tagged-bpg | "Tagged" | 50-100 | 100-300 |
| wtpdf | "WTPDF" \| "Well-Tagged" | 40-80 | 100-250 |
| declarations | "Declarations" | 5-30 | 5-50 |
| an001 | "AN001" \| "Application Note" | 3-20 | 3-30 |
| an002 | "AN002" \| "Application Note" | 3-20 | 3-30 |
| an003 | "AN003" \| "Application Note" | 3-30 | 3-50 |

---

### 3.4 get_section (`04-get-section.test.ts`)

| # | テストケース | 対象 | 検証内容 |
|---|------------|------|----------|
| C-1 | 標準セクション取得 | iso32000-2: "7.3.4" | sectionNumber, title, pageRange, content.length > 0 |
| C-2 | トップレベルセクション | iso32000-2: "7" | content配下に子セクション見出しを含む |
| C-3 | Annexセクション | iso32000-2: "Annex A" | sectionNumberが"Annex A" |
| C-4 | 深いネスト | iso32000-2: "7.3.4.1" 等 | 正常に取得 |
| C-5 | 各仕様の先頭セクション | 全17仕様 | 先頭セクションが正常に取得可能 |
| C-6 | ContentElement型の検証 | iso32000-2 | heading/paragraph/list/table/note/code の各型出現 |
| C-7 | StructTree非対応PDF | pdf17old | フォールバックで plain text が返る |
| C-8 | WTPDF のセクション形式 | wtpdf: "1" | dot-terminated 形式のセクション番号で取得 |
| C-9 | 存在しないセクション | iso32000-2: "999.999" | エラー + サジェスト |
| C-10 | 空文字セクション | - | "must not be empty" エラー |
| C-11 | 大文字小文字 | iso32000-2: "annex a" | case-insensitive で取得 |

---

### 3.5 search_spec (`05-search-spec.test.ts`)

| # | テストケース | 対象 | 検証内容 |
|---|------------|------|----------|
| Q-1 | 基本検索 | iso32000-2: "digital signature" | results.length > 0、snippet含有 |
| Q-2 | PDF 1.7 検索 | pdf17: "cross-reference" | results > 0（PagesMapper修正の回帰確認） |
| Q-3 | 小規模PDF検索 | ts32002: "signature" | 正常動作 |
| Q-4 | 全17仕様で検索 | 全仕様: "PDF" | 全仕様でエラーなく実行（results≥0） |
| Q-5 | AND検索 | iso32000-2: "font descriptor" | 両語を含むスニペット |
| Q-6 | max_results | iso32000-2: max_results=3 | results.length ≤ 3 |
| Q-7 | max_results=1 | iso32000-2 | results.length = 1 |
| Q-8 | ハイフン結合語 | iso32000-2: "cross-reference" | ハイフン正規化で検出 |
| Q-9 | 空クエリ | - | "must not be empty" エラー |
| Q-10 | 500文字超クエリ | - | エラー |
| Q-11 | ヒットなし | iso32000-2: "xyzzynonexistent" | results.length = 0（エラーではない） |

**⚠️ PagesMapper回帰テスト（Q-12〜Q-14）：**

| # | テストケース | 検証内容 |
|---|------------|----------|
| Q-12 | iso32000-2 → pdf17 → iso32000-2 の交互検索 | 2回目のiso32000-2検索も正常 |
| Q-13 | 小→大→小 ページ数の文書切替 | an001(小)→iso32000-2(大)→ts32002(小) |
| Q-14 | 5仕様以上の連続検索 | LRU上限(4)を超えるドキュメント切替 |

---

### 3.6 get_requirements (`06-get-requirements.test.ts`)

| # | テストケース | 対象 | 検証内容 |
|---|------------|------|----------|
| RQ-1 | セクション指定 | iso32000-2: section="12.8" | totalRequirements > 0, statistics含有 |
| RQ-2 | レベルフィルタ (shall) | iso32000-2: level="shall" | 全件 level="shall" |
| RQ-3 | レベルフィルタ (may) | iso32000-2: level="may" | 全件 level="may" |
| RQ-4 | セクション+レベル | iso32000-2: section="7.3", level="shall" | 両条件の AND |
| RQ-5 | フィルタなし（全件） | iso32000-2 | totalRequirements > 100 |
| RQ-6 | PDF 1.7 | pdf17: section="7" | 正常動作 |
| RQ-7 | 小規模PDF | ts32002 | 正常動作（0件でもOK） |
| RQ-8 | 全17仕様 | 全仕様: section省略可 | エラーなく実行 |
| RQ-9 | 統計情報の妥当性 | iso32000-2 | statistics の合計 = totalRequirements |
| RQ-10 | 無効なレベル | level="invalid" | エラー |
| RQ-11 | "shall not" 検出 | iso32000-2: level="shall not" | shall not のみ返る |
| RQ-12 | Requirement ID一意性 | iso32000-2: section="12.8" | 全id がユニーク |

---

### 3.7 get_definitions (`07-get-definitions.test.ts`)

| # | テストケース | 対象 | 検証内容 |
|---|------------|------|----------|
| D-1 | 全定義取得 | iso32000-2: term なし | totalDefinitions > 50 |
| D-2 | 用語検索 | iso32000-2: term="font" | 結果に"font"を含む定義 |
| D-3 | 部分一致 | iso32000-2: term="obj" | "object"関連の定義がヒット |
| D-4 | 大文字小文字無視 | iso32000-2: term="PDF" | 大小問わずヒット |
| D-5 | ヒットなし | iso32000-2: term="xyzzy" | totalDefinitions=0（エラーではない） |
| D-6 | PDF 1.7 | pdf17: term なし | totalDefinitions > 0 |
| D-7 | iso32000-2-2020 | iso32000-2-2020 | 正常動作 |
| D-8 | 非対応spec (ts32002) | ts32002 | "only supported for" エラー |
| D-9 | 非対応spec (wtpdf) | wtpdf | "only supported for" エラー |
| D-10 | 非対応spec (pdfua2) | pdfua2 | "only supported for" エラー |
| D-11 | 定義構造の検証 | iso32000-2 | term非空, definition非空, section形式"3.X" |
| D-12 | notes/source任意 | iso32000-2 | notes/sourceを持つ定義が存在する |

---

### 3.8 get_tables (`08-get-tables.test.ts`)

| # | テストケース | 対象 | 検証内容 |
|---|------------|------|----------|
| T-1 | テーブル取得 | iso32000-2: section有テーブル | tables.length > 0 |
| T-2 | テーブル構造 | iso32000-2 | headers[]非空、rows[][]の列数がheadersと一致 |
| T-3 | table_index | iso32000-2: table_index=0 | tables.length=1 |
| T-4 | table_index 範囲外 | iso32000-2: table_index=999 | エラー |
| T-5 | テーブルなしセクション | iso32000-2: テーブルのないセクション | tables.length=0（エラーではない） |
| T-6 | PDF 1.7 | pdf17 | 正常動作 |
| T-7 | 小規模PDF | ts32002 | 正常動作 |
| T-8 | StructTree非対応 | pdf17old | フォールバック動作 |
| T-9 | THead/TBody ラッパー | iso32000-2 | ヘッダーとボディ行が正しく分離 |

---

### 3.9 compare_versions (`09-compare-versions.test.ts`)

| # | テストケース | 検証内容 |
|---|------------|----------|
| V-1 | 全体比較 | matched > 500, added > 0, removed > 0 |
| V-2 | セクションフィルタ "7" | matchedセクションが"7"または"7."で始まる |
| V-3 | セクションフィルタ "12.8" | フィルタされた結果のみ返る |
| V-4 | マッチ品質サンプリング | matched[0..9]のtitleが空でない、section17/section20が妥当 |
| V-5 | added の妥当性 | 全addedの version="pdf20" |
| V-6 | removed の妥当性 | 全removedの version="pdf17" |
| V-7 | 存在しないセクション | section="999" → matched=0, added=0, removed=0 |
| V-8 | キャッシュ一貫性 | 2回呼び出して同じ結果 |
| V-9 | pdf17 未配置時 | （モック or 条件付きスキップ）エラーメッセージ検証 |
| V-10 | status 値の検証 | matched内に 'same' / 'moved' の両方が存在するか確認 |

---

### 3.10 クロスカット検証 (`10-cross-cutting.test.ts`)

#### LRU ドキュメントキャッシュ

| # | テストケース | 検証内容 |
|---|------------|----------|
| X-1 | 4文書以内のキャッシュヒット | 同一specの2回目呼び出しが高速 |
| X-2 | 5文書目でエビクション | 5つ目のスペックロード後、1番目が再ロードされる |
| X-3 | LRU順序の正しさ | アクセス順が最終アクセス時刻で更新される |

#### PagesMapper 安定性

| # | テストケース | 検証内容 |
|---|------------|----------|
| X-4 | 大→小→大 の文書切替 | iso32000-2(1020p)→an001(小)→iso32000-2 の get_section 正常 |
| X-5 | search後のget_section | search_spec(pdf17) 後に get_section(iso32000-2, "7.3.4") 正常 |
| X-6 | 連続search 5仕様 | 5仕様のsearch_spec を連続実行してエラーなし |

#### セクションコンテンツキャッシュ

| # | テストケース | 検証内容 |
|---|------------|----------|
| X-7 | 同一セクション2回取得 | 2回目が高速（キャッシュヒット） |
| X-8 | 異なるspec同一セクション番号 | iso32000-2:"7.3" と pdf17:"7.3" が別キャッシュ |

#### エラーハンドリング

| # | テストケース | 検証内容 |
|---|------------|----------|
| X-9 | 全ツールの不正引数 | 各ツールに空オブジェクトを渡してクラッシュしない |
| X-10 | specId 50文字超 | "50 characters" エラー |
| X-11 | specId 空文字 | "non-empty string" エラー |
| X-12 | 存在しないspecId | "not found" エラー |

---

### 3.11 パフォーマンスベースライン (`11-performance.test.ts`)

**初回（コールドスタート）と2回目（キャッシュヒット）を計測：**

| # | 操作 | 期待値（目安） | 計測 |
|---|------|-------------|------|
| P-1 | ensureRegistryInitialized (コールド) | < 100ms | ⏱ |
| P-2 | get_structure (iso32000-2, コールド) | < 2000ms | ⏱ |
| P-3 | get_structure (iso32000-2, キャッシュ) | < 50ms | ⏱ |
| P-4 | get_section (iso32000-2, コールド) | < 1000ms | ⏱ |
| P-5 | get_section (iso32000-2, キャッシュ) | < 100ms | ⏱ |
| P-6 | search_spec (iso32000-2, コールド) | < 15000ms | ⏱ |
| P-7 | search_spec (iso32000-2, キャッシュ) | < 200ms | ⏱ |
| P-8 | get_requirements (section指定) | < 2000ms | ⏱ |
| P-9 | get_definitions (コールド) | < 1000ms | ⏱ |
| P-10 | compare_versions (コールド) | < 500ms | ⏱ |
| P-11 | 全17仕様の get_structure 合計 | < 30000ms | ⏱ |

---

## 4. テスト全体の数値目標

| カテゴリ | 予想テスト数 |
|---------|------------|
| 01-registry | 約8件 |
| 02-list-specs | 約8件 |
| 03-get-structure | 約17(全仕様) + 8(エッジ) = 約25件 |
| 04-get-section | 約11件 |
| 05-search-spec | 約14件 + 17(全仕様) = 約31件 |
| 06-get-requirements | 約12件 |
| 07-get-definitions | 約12件 |
| 08-get-tables | 約9件 |
| 09-compare-versions | 約10件 |
| 10-cross-cutting | 約12件 |
| 11-performance | 約11件 |
| **合計** | **約150件** |

---

## 5. 実装上の注意

### 5.1 vitest E2E 設定

```typescript
// tests/e2e/vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/e2e/**/*.test.ts'],
    testTimeout: 120_000,      // search_spec等の重い操作
    hookTimeout: 30_000,       // beforeAll (registry init)
    sequence: { concurrent: false },  // 順序実行（PDF共有リソース）
    reporters: ['verbose'],
  },
});
```

### 5.2 共通セットアップ

```typescript
// tests/e2e/setup.ts
// beforeAll で ensureRegistryInitialized() を呼ぶ
// 環境変数 PDF_SPEC_DIR の検証
// テスト結果のJSON出力（パフォーマンスデータ保存用）
```

### 5.3 テスト実行順序

E2Eテストは **シーケンシャル実行** が必須。理由：
- pdfjs-dist の PagesMapper シングルトン問題
- LRU キャッシュの状態が共有される
- ファイル番号でテスト順序を制御（01→11）

### 5.4 CI/ローカル判定

```typescript
const HAS_PDFS = existsSync(process.env.PDF_SPEC_DIR ?? './pdf-spec');
// PDFがない環境ではスキップ（describe.skipIf(!HAS_PDFS)）
```

### 5.5 パフォーマンス記録

```typescript
// テスト結果をJSONに出力
// tests/e2e/baseline.json に保存
// 次回実行時に比較して ±20% 超の劣化を警告
```

---

## 6. 既知の制約・注意事項

| 項目 | 詳細 |
|------|------|
| PagesMapper | pdfjs-dist v5 のグローバルシングルトン。reloadDocument()で回避済みだが、search操作の順序に注意 |
| DEFINITIONS_SUPPORTED_SPECS | iso32000-2, iso32000-2-2020, pdf17 の3仕様のみ。他は明示的エラー |
| StructTree非対応 | pdf17old等はStructTreeなし → plain textフォールバック。ContentElement型がparagraphのみになる |
| 大規模PDF | iso32000-2(1020p), pdf17(756p), pdf17old(1310p) は処理時間が長い |
| parseSectionNumber | WTPDF("1. Introduction"→"1"), tagged-bpg("Appendix A"→"Appendix A") 等の特殊形式 |
| sectionNumber null | OutlineEntryのsectionNumberはnull可。ドキュメント前書き等 |
| search_spec コールド | 全ページテキスト抽出のため、初回は数秒〜十数秒かかる |
| requirements 全件 | フィルタなしの場合、全セクションを走査するため非常に遅い |

---

## 7. 次のチャットへの引き継ぎ情報

### プロジェクトパス
```
/sessions/gifted-bold-carson/mnt/pdf-spec-mcp
```

### 主要ファイル
```
src/tools/handlers.ts      # 8ツールのハンドラー（テスト対象）
src/tools/definitions.ts   # ツール定義（スキーマ）
src/config.ts              # 設定定数（SPEC_PATTERNS等）
src/types/index.ts         # 全型定義
src/services/pdf-registry.ts   # レジストリ
src/services/pdf-service.ts    # サービス層（キャッシュ管理）
src/services/pdf-loader.ts     # PDFロード（LRU + reloadDocument）
```

### 既存テスト参考
```
src/tools/handlers.test.ts     # ハンドラーのユニットテスト（モック使用）
scripts/phase3-verify.ts       # 統合テスト（参考実装）
```

### 実行コマンド
```bash
npm run build                   # TypeScript ビルド
npm test                        # ユニットテスト (191件)
PDF_SPEC_DIR=./pdf-spec npx tsx scripts/phase3-verify.ts  # 既存統合テスト
```

### 指示例
```
VERIFICATION-PLAN.md に従い、再利用可能なE2Eテストスイートを
tests/e2e/ 配下に vitest で構築してください。
全17仕様×全8ツールの網羅テスト + クロスカット検証 + パフォーマンスベースラインを含めてください。
```
