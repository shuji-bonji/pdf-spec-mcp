# Phase 3 全機能検証レポート

**日時**: 2026-02-07
**バージョン**: 0.2.0
**対象**: `@shuji-bonji/pdf-spec-mcp` Phase 3（マルチ仕様対応）

---

## 検証結果サマリー

| 種別 | 件数 | 結果 |
|------|------|------|
| ユニットテスト | 191 | ✅ 全パス |
| 統合テスト | 33 | ✅ 全パス |
| 発見した不具合 | 3 | ✅ 全修正済 |

---

## 1. ユニットテスト (Vitest)

**191テスト / 10ファイル — 全パス (2.0s)**

| テストファイル | テスト数 | 内容 |
|---|---|---|
| `validation.test.ts` | 44 | Phase 1-2 バリデータ + Phase 3 追加（validateSpecId, validateCompareSection） |
| `handlers.test.ts` | 38 | 8ツール全ハンドラー + specId伝搬 + list_specs/compare_versions |
| `pdf-registry.test.ts` | 19 | spec discovery, カテゴリフィルタ, resolveSpecId, enrichSpecInfo |
| `pdf-loader.test.ts` | 18 | parseSectionNumber（数値/WTPDF/Annex/Appendix/ゼロ幅スペース） |
| `outline-resolver.test.ts` | 15 | セクションインデックス構築, endPage計算, findSection |
| `requirement-extractor.test.ts` | 15 | shall/should/may抽出 |
| `search-index.test.ts` | 12 | 全文検索インデックス構築・検索 |
| `content-extractor.test.ts` | 11 | StructTree解析, テーブル/リスト/ノート抽出 |
| `definition-extractor.test.ts` | 10 | 用語定義抽出 |
| `cache.test.ts` | 9 | LRUキャッシュ |

---

## 2. 統合テスト (phase3-verify.ts)

**33テスト — 全パス (11.3s)**

実際の17個のPDFファイルに対して全8ツールを検証。

### 検証2: PDF環境確認 + レジストリ初期化
- ✅ `ensureRegistryInitialized`: 17仕様を検出
- ✅ 全17 PDF（4 standard + 5 ts + 2 pdfua + 3 guide + 3 appnote）

### 検証3: list_specs（カテゴリフィルタ）
- ✅ `list_specs(all)` → 17仕様
- ✅ `list_specs(standard)` → 4仕様
- ✅ `list_specs(ts)` → 5仕様
- ✅ `list_specs(pdfua)` → 2仕様
- ✅ `list_specs(guide)` → 3仕様
- ✅ `list_specs(appnote)` → 3仕様

### 検証4: 既存ツール後方互換（spec なし）
- ✅ `get_structure` → ISO 32000-2, 1020p, 985セクション
- ✅ `get_section 7.3.4` → "String objects", 21要素
- ✅ `search_spec "digital signature"` → 10件
- ✅ `get_requirements section=12.8` → 221件（shall:140, should:24, may:47, shall not:10）
- ✅ `get_definitions term="font"` → 3件
- ✅ `get_tables section=7.2.2` → 0テーブル

### 検証5: 既存ツール spec パラメータ
- ✅ `get_structure(pdf17)` → ISO 32000-1:2008, 756p, 823セクション
- ✅ `get_structure(ts32002)` → ISO/TS 32002:2022, 13p, 15セクション
- ✅ `get_structure(wtpdf)` → WTPDF 1.0, 57p, 183セクション
- ✅ `get_structure(pdfua2)` → ISO 14289-2:2024, 51p, 172セクション
- ✅ `get_section(pdf17, 7.3)` → "Objects"
- ✅ `search_spec(pdf17, "cross-reference")` → 10件

### 検証5b: enrichSpecInfo 反映確認
- ✅ iso32000-2: 1020p/1117s, pdf17: 756p/949s

### 検証6: compare_versions
- ✅ 全セクション比較: matched=701, added=283, removed=122
- ✅ section=12.8 フィルタ: matched=13, added=23, removed=4
- ✅ section=7.3 フィルタ: matched=16, added=0, removed=0

### 検証7: エラーハンドリング + エッジケース
- ✅ 無効なspec → "not found"
- ✅ セクション未指定 → "Section must be a string"
- ✅ 空セクション → "must not be empty"
- ✅ 空クエリ → "must not be empty"
- ✅ 非対応spec定義 → "only supported for ISO 32000-2"
- ✅ 存在しないセクション → "not found"
- ✅ 50文字超specId → "50 characters"

### 検証7b: parseSectionNumber 拡張確認
- ✅ WTPDF: "1. Introduction" → "1"（8個のトップレベルセクション）
- ✅ tagged-bpg: Appendix解析対応

---

## 3. 発見・修正した不具合

### Bug #1: pdfjs-dist PagesMapper シングルトン問題 ⚠️ 重大

**症状**: `search_spec(spec='pdf17')` が "Invalid page request" で失敗

**根本原因**: pdfjs-dist v5 の `PagesMapper` クラスが **static フィールド** を使用しており、全ドキュメントインスタンスで `pagesNumber` を共有。最後に `getDocument()` した文書の `numPages` が全文書の `getPage()` 上限になる。

```
PagesMapper.#pagesNumber = 最後にロードした文書のページ数
→ それ以前のキャッシュ済み文書で、この値を超えるページにアクセス不可
```

**修正**:
- `pdf-loader.ts`: `reloadDocument()` 関数を追加。サーチインデックス構築前にドキュメントを強制リロードし、`PagesMapper` を正しいページ数にリセット
- `pdf-service.ts`: `searchSpec()` 内で `reloadDocument()` を使用
- `content-extractor.ts`: 防御的ページ範囲クランプを追加

### Bug #2: outline-resolver.ts endPage クランプ不足

**症状**: アウトラインの endPage が `totalPages` を超える可能性

**修正**: `Math.min(totalPages, ...)` でクランプ

### Bug #3: phase3-verify.ts null安全チェック

**症状**: tagged-bpg テストで `sectionNumber` が `null` のエントリに対して `startsWith()` 呼び出し

**修正**: `sectionNumber?.startsWith()` （オプショナルチェイニング）

---

## 4. 修正ファイル一覧

| ファイル | 変更内容 |
|---|---|
| `src/services/pdf-loader.ts` | `reloadDocument()` 追加（PagesMapper対策） |
| `src/services/pdf-service.ts` | `searchSpec` で `reloadDocument` 使用 |
| `src/services/content-extractor.ts` | ページ範囲クランプ追加 |
| `src/services/outline-resolver.ts` | endPage に `Math.min(totalPages, ...)` |
| `scripts/phase3-verify.ts` | null安全チェック |

---

## 5. 結論

Phase 3 の全機能が正常に動作することを確認しました。

- **後方互換**: spec パラメータなしで既存動作維持
- **マルチ仕様**: 17個のPDF仕様を同時サポート
- **バージョン比較**: PDF 1.7 ↔ 2.0 のセクション対応付け（701セクションマッチ）
- **pdfjs-dist問題**: `PagesMapper` シングルトン問題を `reloadDocument()` で回避
