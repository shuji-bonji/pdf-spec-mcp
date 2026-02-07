# Phase 0.5 技術調査レポート

## 調査日: 2026-02-07

## 1. 調査概要

Phase 3 設計に先立ち、`pdf-spec/` ディレクトリ内の全17 PDFファイルについて以下を調査した：

1. アウトライン（ブックマーク）の有無と構造
2. StructTree（Tagged PDF）の有無と利用可能なロール
3. テキスト抽出の可否
4. セクション番号体系と既存パーサーとの互換性
5. PDF 1.7 ↔ 2.0 のセクション対応可能性

## 2. 全体サマリー

### 2.1 全文書の基本特性

| ファイル | ページ | アウトライン | エントリ数 | StructTree | Table検出 | セクション番号パース |
|----------|--------|:----------:|-------:|:----------:|:---------:|:-------------------:|
| ISO_32000-2_sponsored-ec2 | 1,020 | ✅ | 985 | ✅ | ✅ | ✅ |
| ISO_32000-2-2020_sponsored | 1,003 | ✅ | 965 | ✅ | ✅ | ✅ |
| PDF32000_2008 (PDF 1.7) | 756 | ✅ | 823 | ✅ | ✅ | ✅ |
| pdfreference1.7old | 1,310 | ✅ | 794 | ✅ | ✅ | ✅ |
| ISO_TS_32001 | 13 | ✅ | 13 | ✅ | ❌* | ✅ |
| ISO_TS_32002 | 13 | ✅ | 15 | ✅ | ✅ | ✅ |
| ISO_TS_32003 | 13 | ✅ | 12 | ✅ | ✅ | ✅ |
| ISO-TS-32004 | 25 | ✅ | 40 | ✅ | ✅ | ✅ |
| ISO-TS-32005 | 49 | ✅ | 24 | ✅ | ✅ | ✅ |
| ISO-14289-1 (PDF/UA-1) | 25 | ✅ | 90 | ✅ | ✅ | ✅ |
| ISO-14289-2 (PDF/UA-2) | 51 | ✅ | 172 | ✅ | ✅ | ✅ |
| PDF-Declarations | 10 | ✅ | 28 | ✅ | ❌* | ✅ |
| PDF20_AN001-BPC | 5 | ✅ | 14 | ✅ | ❌ | ❌ (タイトルのみ) |
| PDF20_AN002-AF | 14 | ✅ | 37 | ✅ | ❌ | ✅ |
| PDF20_AN003-Metadata | 10 | ✅ | 28 | ✅ | ❌ | ❌ (タイトルのみ) |
| Tagged-PDF-BPG | 72 | ✅ | 193 | ✅ | ✅ | ✅ |
| Well-Tagged-PDF-WTPDF | 57 | ✅ | 186 | ✅ | ✅ | ⚠️ (ドット付き) |

\* テスト対象ページにテーブルがなかっただけの可能性あり

### 2.2 重要な発見

**全17 PDFが以下の3要件を満たす：**
1. ✅ アウトライン（ブックマーク）が存在する
2. ✅ StructTree（Tagged PDF 構造）が存在する
3. ✅ テキスト抽出が機能する

**→ 既存アーキテクチャ（アウトライン + StructTree ベースの抽出）は全文書に適用可能**

## 3. カテゴリ別の詳細分析

### 3.1 ISO TS 文書 (32001, 32002, 32003, 32004, 32005)

**構造的特徴：**
- StructTree ルートロール: `Art → Document → Root → Sect`（ISO 32000-2 の `Document → Part` とは異なる）
- セクション番号: `"1 Scope"`, `"5.1.2 Additions to..."` — **既存パーサーで完全対応**
- テーブル: THead/TBody/TR 構造 — **既存テーブル抽出と互換**
- アウトライン深度: 2〜3 レベル（ISO 32000-2 の5レベルより浅い）

**特殊文字の問題：**
- TS 32001, TS 32002 のアウトラインにゼロ幅スペース（U+200B）が含まれる
  - 例: `"1 ​Scope "` ← セクション番号と本文の間にU+200B
  - **既存の `parseSectionNumber()` は正常にパース可能**（正規表現 `\s+` の前に通常スペースもあるため）

**セクション構造の特徴：**
- 全TSが標準ISO構造: Foreword → Introduction → 1 Scope → 2 Normative references → ...
- セクション数は12〜40エントリ（ISO 32000-2 の985と比較して非常に小さい）
- TSのセクションタイトルにISO 32000-2 への参照を含む場合あり
  - 例: `"5.1.2 Addition to ISO 32000-2:2020, Table 237"`

### 3.2 PDF/UA 文書 (ISO 14289-1, 14289-2)

**構造的特徴：**
- ISO 14289-1: アウトラインにタブ文字あり（`"1\tScope "`） — **パース正常**
- ISO 14289-2: 特殊文字なし、クリーンなフォーマット
- テーブル: 14289-1 は `Table → TR → TH/TD`（THead/TBody なし）、14289-2 も同様
  - ISO 32000-2 の `Table → THead/TBody → TR` と**構造が異なる**
  - **既存テーブル抽出器は THead/TBody なしでも対応済み**（`collectTable` が直接 TR を処理）
- アウトラインエントリ: 90〜172（中規模）

### 3.3 PDF 1.7 (PDF32000_2008)

**構造的特徴：**
- 756ページ、823 アウトラインエントリ
- セクション番号フォーマット: ISO 32000-2 と同じ `"7.3.4 Title"` 形式
- StructTree: `Art → Document → Part` — ISO 32000-2 と同じ構造
- テーブル: `THead/TBody` ラッパーあり — 既存抽出と完全互換
- Annex: `"Annex A (informative) Operator Summary"` — 既存パースで対応

**PDF 1.7 特有の問題（110エントリがパース不能）：**
- 一部のアウトラインエントリがセクション番号なしのフリーテキスト
  - 例: `"Interactive Features That Aid Technical Communication"`（セクション番号なし）
  - ISO 32000-2 には存在しないパターン

### 3.4 PDF Association 文書

**Application Notes (AN001, AN002, AN003):**
- AN001, AN003: **セクション番号なし**（タイトルのみの目次構造）
  - 例: `"What is Black Point Compensation?"`, `"General"`, `"Scope"`
  - **既存のセクション番号ベースのアクセスは不可能** → タイトルベースのアクセスが必要
- AN002: `"1 Introduction"`, `"4.1 AF entry in the catalog"` — セクション番号あり

**Tagged PDF Best Practice Guide:**
- 72ページ、193エントリ — 中規模文書
- セクション番号フォーマット: ISO 準拠（`"3.2.1 Title"` 形式）
- テーブル、リスト、コードブロック含む

**Well-Tagged PDF (WTPDF):**
- **⚠️ セクション番号にドット付き: `"1. Introduction"` ← 既存パーサー非対応**
  - 正規表現 `^(\d+(?:\.\d+)*)\s+` は `"1."` の後の空白を期待するが `"1. "` は `.` を小数点と解釈しない
  - 実際にはトップレベルの `"1. Introduction"` 〜 `"8. File format requirements"` がパース不能
  - サブセクション `"4.1 artifact marked content sequence"` はパース可能
- **⚠️ "Appendix" を使用（"Annex" ではない）** — 既存パーサー非対応
  - `"Appendix A: Example PDF Declaration..."` → `parseSectionNumber()` は `null` を返す

## 4. PDF 1.7 ↔ 2.0 セクション対応分析

### 4.1 タイトルベース自動マッチング結果

| 指標 | 値 |
|------|------|
| PDF 1.7 全エントリ | 823 |
| PDF 2.0 全エントリ | 985 |
| タイトル一致セクション | **517** |
| マッチ率（対1.7） | **62.8%** |

### 4.2 トップレベル構造の差異

```
PDF 1.7:                    PDF 2.0:
1  Scope                    1  Scope
2  Conformance         →    6  Conformance        ← 移動
3  Normative references →   2  Normative references ← 移動
4  Terms and definitions →  3  Terms and definitions ← 移動
5  Notation            →    4  Notation            ← 移動
6  Version Designations →   5  Version designations ← 移動
7  Syntax                   7  Syntax
8  Graphics                 8  Graphics
9  Text                     9  Text
10 Rendering                10 Rendering
11 Transparency             11 Transparency
12 Interactive Features     12 Interactive features
13 Multimedia Features      13 Multimedia features
14 Document Interchange     14 Document interchange
```

- **セクション 1, 7〜14 は番号一致**
- **セクション 2〜6 は入れ替わっている**

### 4.3 深いセクションのマッチ状況

```
同一番号の例:
  7.3.4 → 7.3.4 "string objects"
  7.3.7 → 7.3.7 "dictionary objects"
  8.4.1 → 8.4.1 "graphics state"

番号が異なる例:
  2.1   → 6.1   "general" (Conformance 内)
  7.2.2 → 7.2.3 "character set"
  7.2.3 → 7.2.4 "comments"
```

### 4.4 セクション対応の推奨アプローチ

**案B（タイトルベース自動マッチング）が最適：**
- 62.8%のセクションがタイトル一致で自動対応可能
- 残りの37%は主に「一般(general)」などの汎用タイトルの重複によるもの
- 実装: アウトライン読み込み時に正規化タイトル → セクション番号のマップを構築し、クロスリファレンス

## 5. アーキテクチャ方針の決定

### 5.1 結論: 案C（マルチドキュメント対応 + 既存ツール汎用化）

調査結果から、**全文書がアウトライン + StructTree を持ち、構造が十分に共通**であることが判明した。

```
推奨アーキテクチャ:

  pdf-spec/
    ├── ISO_32000-2_sponsored-ec2.pdf  (primary)
    ├── PDF32000_2008.pdf              (pdf17)
    ├── ISO_TS_32001-2022_sponsored.pdf
    ├── ISO_TS_32002-2022_sponsored.pdf
    ├── ...                            (auto-discovered)

  PDFRegistry
    ├── registerDocument(id, path, metadata)
    ├── getDocument(id) → PDFDocumentProxy
    ├── listDocuments() → DocumentInfo[]
    └── auto-discover from PDF_SPEC_DIR
```

### 5.2 既存ツールへの変更

| ツール | 変更内容 |
|--------|----------|
| `get_structure` | `spec` パラメータ追加（省略時は ISO 32000-2 EC2） |
| `get_section` | `spec` パラメータ追加 |
| `search_spec` | `spec` パラメータ追加（省略時は全文書横断 or primary のみ） |
| `get_requirements` | `spec` パラメータ追加 |
| `get_definitions` | `spec` パラメータ追加 |
| `get_tables` | `spec` パラメータ追加 |
| **NEW** `list_specs` | 利用可能な文書一覧を返す |
| **NEW** `compare_versions` | PDF 1.7 ↔ 2.0 のセクション差分 |

### 5.3 実装に必要な対応

| 項目 | 優先度 | 詳細 |
|------|--------|------|
| PDFレジストリ実装 | 高 | マルチドキュメント管理、自動発見 |
| `parseSectionNumber()` 拡張 | 中 | `"1. Introduction"` 形式対応（WTPDF用） |
| "Appendix" パース対応 | 中 | Annex と同等に扱う |
| ゼロ幅スペース正規化 | 低 | 現状でも動作するが、タイトル表示時にクリーンアップ |
| タブ文字正規化 | 低 | ISO 14289-1 用 |
| タイトルベースセクションマッピング | 高 | `compare_versions` 用 |

### 5.4 文書カテゴリとID体系

```
Auto-discovery ルール:
  ISO_32000-2_sponsored-ec2.pdf   → id: "iso32000-2"    (primary)
  PDF32000_2008.pdf               → id: "pdf17"          (legacy)
  ISO_TS_32001-2022_sponsored.pdf → id: "ts32001"
  ISO_TS_32002-2022_sponsored.pdf → id: "ts32002"
  ISO_TS_32003-2023_sponsored.pdf → id: "ts32003"
  ISO-TS-32004-2024_sponsored.pdf → id: "ts32004"
  ISO-TS-32005-2023-sponsored.pdf → id: "ts32005"
  ISO-14289-1-2014-sponsored.pdf  → id: "pdfua1"
  ISO-14289-2-2024-sponsored.pdf  → id: "pdfua2"
  PDF-Declarations.pdf            → id: "declarations"
  PDF20_AN001-BPC.pdf             → id: "an001"
  PDF20_AN002-AF.pdf              → id: "an002"
  PDF20_AN003-...pdf              → id: "an003"
  Tagged-PDF-Best-Practice...pdf  → id: "tagged-bpg"
  Well-Tagged-PDF-WTPDF-1.0.pdf   → id: "wtpdf"
  pdfreference1.7old.pdf          → id: "pdf17old"       (legacy)
  ISO_32000-2-2020_sponsored.pdf  → id: "iso32000-2-2020" (original, no errata)
```

## 6. Phase 3 実装計画（推奨）

### Step 1: PDFレジストリ + list_specs (基盤)
- `PDFRegistry` クラス実装
- ディレクトリスキャンによる自動発見
- ファイル名パターンからID / メタデータ推定
- `list_specs` ツール実装

### Step 2: 既存6ツールの `spec` パラメータ対応
- 全ツールに optional `spec` パラメータ追加
- 省略時は `"iso32000-2"` をデフォルト（後方互換）
- `pdf-service.ts` のシングルトンを `PdfServiceManager` に置換

### Step 3: compare_versions 実装
- タイトルベース自動マッチング
- セクション diff 生成（追加 / 削除 / 変更）

### Step 4: 電子署名統合ビュー（オプション）
- ISO 32000-2 12.8 + TS 32002 の横断参照
- PAdES プロファイル要件の構造化抽出
