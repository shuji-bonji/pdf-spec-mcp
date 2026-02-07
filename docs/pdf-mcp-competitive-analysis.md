# PDF関連 MCPサーバー 競合比較

## 結論：競合なし（カテゴリが異なる）

既存のPDF関連MCPサーバーは **すべて「PDFファイルの読み書き操作」** が目的。
`pdf-spec-mcp` のような **「PDF仕様書（ISO 32000）の参照・解析」** を行うMCPサーバーは存在しない。

---

## 既存 PDF 関連 MCP サーバー一覧

| パッケージ | 分類 | 主な機能 | ⭐ / DL |
|------------|------|----------|---------|
| `@sylphx/pdf-reader-mcp` | 📄 読み取り | テキスト・画像抽出、並列処理、URL対応 | 本格的 |
| `@iflow-mcp/pdf-reader-mcp` | 📄 読み取り | pdfjs-dist ベース、ページ指定、メタデータ | 活発 |
| `@fabriqa.ai/pdf-reader-mcp` | 📄 読み取り | テキスト抽出、PDF内テキスト検索 | — |
| `@shtse8/pdf-reader-mcp` | 📄 読み取り | read_pdf 1ツール、バッチ処理 | — |
| `@johangorter/mcp-pdf-server` | 📄 読み取り | テキスト抽出のみ（テキストオンリー） | — |
| `@dev.saqibaziz/mcp-pdf-reader` | 📄 読み取り | ローカル/URL両対応 | — |
| `@nova-mind-cloud/pdf-parser-mcp` | 📄 読み取り | 有料サブスク（€39〜/月） | — |
| `markdown2pdf-mcp` | 📝 生成 | Markdown → PDF 変換 | — |

---

## カテゴリマッピング

```
PDF 関連 MCP の分類
├── 📄 PDF ファイル操作（既存 7+ パッケージ）
│   ├── テキスト抽出（read_pdf）
│   ├── メタデータ取得
│   ├── ページ指定抽出
│   ├── 画像抽出
│   └── バッチ処理
│
├── 📝 PDF 生成（既存 1 パッケージ）
│   └── Markdown → PDF 変換
│
└── 📐 PDF 仕様参照（⭐ 競合なし ← pdf-spec-mcp）
    ├── 仕様セクション構造参照
    ├── 仕様キーワード検索
    ├── 要件（MUST/SHOULD/MAY）抽出  ← Phase 2
    ├── 用語定義抽出               ← Phase 2
    ├── テーブル定義抽出            ← Phase 2
    └── バージョン比較              ← Phase 3
```

---

## 差別化の本質

### 既存 PDF MCP が解決する課題
> 「このPDFファイルの中身を読みたい」

### pdf-spec-mcp が解決する課題
> 「PDFを作る／読む／検証するソフトウェアを開発したい。仕様を確認したい」

### 対象ユーザーの違い

| | 既存 PDF MCP | pdf-spec-mcp |
|---|---|---|
| **ユーザー** | PDFを「使う」人 | PDFを「実装する」人 |
| **ユースケース** | 文書からテキスト抽出、要約 | PDF準拠のリーダー/ライター開発 |
| **入力** | PDFファイル | 質問・技術的クエリ |
| **出力** | テキスト、メタデータ | 仕様条文、要件、定義 |
| **競合** | 7+ パッケージ（激戦区） | **なし**（ブルーオーシャン） |

---

## 類似パターン（他分野での先例）

pdf-spec-mcp のポジションは、接続中の他MCPと同じパターン：

| MCP | 対象仕様 | 類似度 |
|-----|----------|--------|
| **rfcxml** | IETF RFC 文書 | ⭐ 最も近い — セクション解析+要件抽出 |
| **w3c** | W3C/WHATWG Web仕様 | 近い — 仕様検索+WebIDL定義取得 |
| **ietf** | RFC 文書（テキスト） | やや近い — 文書取得のみ |

rfcxml の PDF版 = pdf-spec-mcp、という位置づけが最もわかりやすい。

---

## 想定ユースケース（README / example 用）

### 1. PDF リーダー/ライター開発者
```
Q: 「cross-reference tableの構造を教えて」
→ get_section("7.5.4") で仕様を即座に取得
```

### 2. 電子署名の実装者
```
Q: 「デジタル署名で MUST な要件は？」
→ get_requirements(section="12.8") で規範的要件を抽出
```

### 3. PDF/A, PDF/UA 準拠チェッカー開発者
```
Q: 「Tagged PDF の structure element 一覧は？」
→ search_spec("standard structure types") で関連セクションを発見
→ get_section("14.8.4") で定義テーブルを取得
```

### 4. アクセシビリティ（PDF/UA）対応
```
Q: 「読み上げ順序の仕様はどこ？」
→ search_spec("reading order") で 14.8 周辺を特定
```

### 5. フォント埋め込み・CMap 実装
```
Q: 「CMap の仕様は？」
→ search_spec("CMap") → get_section("9.7.5")
```

---

## まとめ

| 観点 | 評価 |
|------|------|
| **直接競合** | なし |
| **カテゴリ** | 新規カテゴリ（仕様参照型） |
| **先例** | rfcxml, w3c と同パターン |
| **市場** | ニッチだが深い需要（PDF開発者） |
| **差別化リスク** | 低（仕様書パース＋構造解析は参入障壁あり） |
