# Phase 0: Technical Findings

> PDF Spec MCP - ISO 32000 仕様の解析可能性検証
> Date: 2026-02-07

## 1. 対象ファイル一覧

### 1.1 コア仕様 (ISO 32000)

| ファイル | 内容 | サイズ | ページ数 |
|---------|------|--------|---------|
| `ISO_32000-2_sponsored-ec2.pdf` | **PDF 2.0 (Errata Collection 2)** | 17MB | 1,020 |
| `ISO_32000-2-2020_sponsored.pdf` | PDF 2.0 旧版 | 15MB | 1,003 |
| `PDF32000_2008.pdf` | PDF 1.7 (ISO 32000-1) | 21MB | 756 |
| `pdfreference1.7old.pdf` | PDF 1.7 旧版リファレンス | 31MB | 1,310 |

### 1.2 拡張仕様 (TS)

| ファイル | 内容 | ページ数 |
|---------|------|---------|
| `ISO_TS_32001-2022_sponsored.pdf` | ハッシュアルゴリズム拡張 | 13 |
| `ISO_TS_32002-2022_sponsored.pdf` | 電子署名拡張 (PAdES) | 13 |
| `ISO_TS_32003-2023_sponsored.pdf` | AES-GCM 暗号化 | 13 |
| `ISO-TS-32004-2024_sponsored.pdf` | 整合性保護 | 25 |
| `ISO-TS-32005-2023-sponsored.pdf` | PDF/UA マッピング | 49 |

### 1.3 アクセシビリティ (PDF/UA)

| ファイル | 内容 | ページ数 |
|---------|------|---------|
| `ISO-14289-1-2014-sponsored.pdf` | PDF/UA-1 | 25 |
| `ISO-14289-2-2024-sponsored.pdf` | PDF/UA-2 | 51 |

### 1.4 PDF Association 付属文書

| ファイル | 内容 | ページ数 |
|---------|------|---------|
| `Tagged-PDF-Best-Practice-Guide.pdf` | Tagged PDF ベストプラクティス | 72 |
| `Well-Tagged-PDF-WTPDF-1.0.pdf` | WTPDF 仕様 | 57 |
| `PDF-Declarations.pdf` | PDF 宣言 | - |
| `PDF20_AN001-BPC.pdf` | Application Note: BPC | - |
| `PDF20_AN002-AF.pdf` | Application Note: AF | - |
| `PDF20_AN003-ObjectMetadataLocations.pdf` | Application Note: メタデータ配置 | - |

---

## 2. アウトライン (ブックマーク) 解析

### 2.1 結果サマリー

| ファイル | アウトライン数 | dest 形式 | ページ解決 |
|---------|-------------|----------|----------|
| ISO 32000-2 EC2 | **985** | Array (direct) | **全件成功** |
| ISO 32000-2 2020 | 965 | Array (direct) | 964/965 成功 |
| PDF 1.7 (2008) | 823 | **String (named)** | **全件成功** (2段階解決) |
| PDF 1.7 旧版 | 794 | String (named) | 全件成功 (2段階解決) |
| TS 32001 | 13 | String (named) | 全件成功 (2段階解決) |
| TS 32002 | 15 | Array (direct) | 全件成功 |
| TS 32003 | 12 | Array (direct) | 全件成功 |
| TS 32004 | 40 | Array (direct) | 全件成功 |
| TS 32005 | 24 | Array (direct) | 全件成功 |
| PDF/UA-1 | 90 | Array (direct) | 全件成功 |
| PDF/UA-2 | 172 | Array (direct) | 全件成功 |
| Tagged PDF Guide | 193 | Array (direct) | 187/193 成功 |
| WTPDF 1.0 | 186 | Array (direct) | 185/186 成功 |

### 2.2 dest の2つの形式

PDFのアウトラインには destination (dest) の形式が2種類ある:

```
// 形式1: Array (direct dest) — ISO 32000-2, 新しいTS仕様
dest: [{ num: 77, gen: 0 }, { name: "XYZ" }, 69, 751, 0]
→ doc.getPageIndex(dest[0]) + 1 で直接解決

// 形式2: String (named dest) — PDF 1.7, 旧TS仕様
dest: "G5.782724"
→ doc.getDestination(destName) で配列に変換してから解決
```

### 2.3 ISO 32000-2 EC2 アウトライン構造 (トップレベル)

```
Cover page → page 1
Errata explanation → page 2
ISO 32000-2:2020 front page → page 3
Foreword → page 10
Introduction → page 11
1 Scope → page 19
2 Normative references → page 20
3 Terms and definitions → page 25
4 Notation → page 33
5 Version designations → page 35
6 Conformance → page 36
7 Syntax → page 38         (children: 12)
8 Graphics → page 163      (children: 11)
9 Text → page 311          (children: 10)
10 Rendering → page 378    (children: 8)
11 Transparency → page 405 (children: 7)
12 Interactive features → page 455  (children: 11)
13 Multimedia features → page 632   (children: 7)
14 Document interchange → page 731  (children: 13)
Annex A ~ Q
Bibliography
```

---

## 3. テキスト抽出

### 3.1 pdfjs-dist の getTextContent()

`pdfjs-dist` の `page.getTextContent()` で位置情報付きテキストを取得可能:

```js
const page = await doc.getPage(pageNum);
const textContent = await page.getTextContent();

for (const item of textContent.items) {
  // item.str: テキスト内容
  // item.transform[4]: x座標
  // item.transform[5]: y座標
  // item.width: テキスト幅
  // item.height: テキスト高さ (≈ フォントサイズ)
}
```

### 3.2 テキスト抽出品質

- **本文テキスト**: 良好。段落構造もy座標の差で識別可能
- **セクション見出し**: `height` が本文 (11pt) より大きい (13pt+) ので識別可能
- **コード例**: 等幅フォント領域として x 座標のインデントで識別可能
- **ヘッダー/フッター**: y座標の位置 (ページ上端/下端) で除外可能
- **NOTE/EXAMPLE**: テキストパターン ("NOTE 1", "EXAMPLE") で識別可能

### 3.3 ページ番号体系

PDFの物理ページ番号と仕様書の論理ページ番号にはオフセットがある:
- EC2版: 前付け (カバー、正誤表説明、タイトル、著作権、目次、前文、序文) ≈ 18ページ
- 論理ページ 1 (Scope) = 物理ページ 19

---

## 4. テーブル抽出

### 4.1 検証結果

| 手法 | 結果 |
|------|------|
| `pdf-parse` の `getTable()` | **0件** (罫線ベース検出失敗) |
| `pdfjs-dist` テキスト位置情報 | テーブル構造の手動再構成は**可能** |

### 4.2 テーブルの特徴

仕様書内のテーブルは2種類:

1. **キー・値テーブル** (多数): PDF辞書のエントリ定義
   ```
   Table 5 — Entries in a stream dictionary
   Key  | Type    | Value
   ---  | ---     | ---
   Type | name    | (Optional) ...
   ```

2. **比較テーブル** (少数): 機能比較、エンコーディング表

### 4.3 推奨戦略

テキストの **x座標クラスタリング** でテーブル列を識別:

```
[143, y] "Syntax for Literal name"    → 列1 (x ≈ 143)
[312, y] "Resulting Name"             → 列2 (x ≈ 312)
[143, y] "/Name1"                     → 列1
[312, y] "Name1"                      → 列2
```

- テーブル開始: `"Table N — Title"` パターンで検出
- テーブル終了: 次のセクション見出しまたは通常本文の開始で判定
- 列の識別: x座標のクラスターを K-means 的に分類

---

## 5. PDF解析ライブラリ評価

### 5.1 比較

| ライブラリ | アウトライン | ページ解決 | テキスト抽出 | 位置情報 | テーブル | 判定 |
|-----------|-----------|----------|-----------|---------|--------|------|
| **pdfjs-dist** | OK | OK (2形式対応) | OK (ページ単位) | OK (x,y,w,h) | - | **採用** |
| pdf-parse v4 | OK | 部分的 (obj ref のみ) | NG (ページ指定無視) | - | NG (0件) | 不採用 |

### 5.2 pdfjs-dist 使用時の注意点

- ESM only: `import` 文が必要 (`pdfjs-dist/legacy/build/pdf.mjs`)
- `legacy` ビルドを使用 (Node.js 互換性)
- `standardFontDataUrl` 警告が出るが動作には影響なし
- `Uint8Array` で入力する必要がある (`Buffer` 不可)

---

## 6. 結論と Phase 1 への推奨事項

### 6.1 技術的に実現可能

- **セクション構造取得** (`get_structure`): アウトラインから直接構築 → **容易**
- **セクション内容取得** (`get_section`): アウトライン→ページ範囲→テキスト抽出 → **容易**
- **キーワード検索** (`search_spec`): 全ページテキスト抽出→インデックス構築 → **中程度**
- **要件抽出** (`get_requirements`): SHALL/MUST パターンマッチ → **容易**
- **定義取得** (`get_definitions`): Section 3 の構造化パターン → **容易**
- **テーブル取得** (`get_tables`): x座標クラスタリング → **要カスタム実装**

### 6.2 推奨アーキテクチャ

```
pdf-spec/               ← ユーザーがPDFを配置
  ISO_32000-2_sponsored-ec2.pdf   ← メイン仕様
  ...

src/
  parser/
    pdf-loader.ts        ← pdfjs-dist ラッパー
    outline-resolver.ts  ← アウトライン→ページ解決 (2形式対応)
    text-extractor.ts    ← 位置情報付きテキスト抽出
    table-extractor.ts   ← x座標クラスタリングによるテーブル再構成
  index/
    section-index.ts     ← セクション階層インデックス
    search-index.ts      ← 全文検索インデックス
  tools/
    get-structure.ts
    get-section.ts
    search-spec.ts
    get-requirements.ts
    get-definitions.ts
    get-tables.ts
  server.ts              ← MCP サーバー
```

### 6.3 メイン仕様の推奨

**`ISO_32000-2_sponsored-ec2.pdf`** (EC2版) を第一優先とする:
- 最新版 (Errata Collection 2 反映)
- 1,020ページ / 985アウトラインエントリ
- アウトラインのページ解決が最も安定

---

*Phase 0 完了。Phase 1 (コア機能 MVP) の実装に進む準備完了。*
