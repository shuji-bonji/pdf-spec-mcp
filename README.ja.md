# PDF SPEC MCP Server

[![CI](https://github.com/shuji-bonji/pdf-spec-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/shuji-bonji/pdf-spec-mcp/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@shuji-bonji/pdf-spec-mcp)](https://www.npmjs.com/package/@shuji-bonji/pdf-spec-mcp)

[English README](README.md)

ISO 32000（PDF）仕様書への構造化アクセスを提供する MCP（Model Context Protocol）サーバーです。LLM が PDF 仕様書をナビゲート・検索・分析するためのツールを提供します。

## 特徴

- **マルチ仕様対応** — 最大17の PDF 関連文書を自動検出（ISO 32000-2、PDF/UA、Tagged PDF ガイド等）
- **構造化コンテンツ抽出** — 見出し・段落・リスト・テーブル・注記をセクション単位で取得
- **全文検索** — セクションコンテキスト付きキーワード検索
- **要件抽出** — ISO 規約に基づく規範的言語（shall / must / may）の抽出
- **用語定義検索** — Section 3（用語定義）からの用語検索
- **テーブル抽出** — 複数ページにまたがるテーブル検出とヘッダーマージ
- **バージョン比較** — PDF 1.7 と PDF 2.0 のセクション構造差分
- **並行処理** — 大規模ドキュメントのチャンク並行ページ処理

## 提供ツール

| ツール             | 説明                                            |
| ------------------ | ----------------------------------------------- |
| `list_specs`       | 検出済みの全 PDF 仕様一覧をメタデータ付きで取得 |
| `get_structure`    | セクション階層（目次）を深さ指定で取得          |
| `get_section`      | 指定セクションの構造化コンテンツを取得          |
| `search_spec`      | 仕様書内の全文キーワード検索                    |
| `get_requirements` | 規範的要件（shall/must/may）を抽出              |
| `get_definitions`  | 用語定義を検索                                  |
| `get_tables`       | セクション内のテーブル構造を抽出                |
| `compare_versions` | PDF 1.7 と PDF 2.0 のセクション構造を比較       |

## 対応仕様

`PDF_SPEC_DIR` 内の PDF ファイルをファイル名パターンで自動検出します：

| カテゴリ                   | Spec ID                                              | 文書                                              |
| -------------------------- | ---------------------------------------------------- | ------------------------------------------------- |
| **標準**                   | `iso32000-2`, `iso32000-2-2020`, `pdf17`, `pdf17old` | ISO 32000-2 (PDF 2.0), ISO 32000-1 (PDF 1.7)      |
| **技術仕様**               | `ts32001` – `ts32005`                                | ハッシュ、電子署名、AES-GCM、整合性保護、名前空間 |
| **PDF/UA**                 | `pdfua1`, `pdfua2`                                   | アクセシビリティ (ISO 14289-1, 14289-2)           |
| **ガイド**                 | `tagged-bpg`, `wtpdf`, `declarations`                | Tagged PDF、Well-Tagged PDF、Declarations         |
| **アプリケーションノート** | `an001` – `an003`                                    | BPC、Associated Files、Object Metadata            |

## 前提条件

- Node.js >= 20.0.0
- PDF 仕様書ファイル（同梱されません — [PDF Association](https://pdfa.org/sponsored-standards/) から入手してください）

## インストール

```bash
npm install @shuji-bonji/pdf-spec-mcp
```

npx での直接実行も可能です：

```bash
PDF_SPEC_DIR=/path/to/pdf-specs npx @shuji-bonji/pdf-spec-mcp
```

## 設定

### 環境変数

| 変数           | 説明                                       | デフォルト |
| -------------- | ------------------------------------------ | ---------- |
| `PDF_SPEC_DIR` | PDF 仕様書ファイルが格納されたディレクトリ | （必須）   |

### Claude Desktop

`claude_desktop_config.json` に追加：

```json
{
  "mcpServers": {
    "pdf-spec": {
      "command": "npx",
      "args": ["-y", "@shuji-bonji/pdf-spec-mcp"],
      "env": {
        "PDF_SPEC_DIR": "/path/to/pdf-specs"
      }
    }
  }
}
```

### Cursor / VS Code

`.cursor/mcp.json` または VS Code の MCP 設定に追加：

```json
{
  "mcpServers": {
    "pdf-spec": {
      "command": "npx",
      "args": ["-y", "@shuji-bonji/pdf-spec-mcp"],
      "env": {
        "PDF_SPEC_DIR": "/path/to/pdf-specs"
      }
    }
  }
}
```

## 使用例

接続後、LLM は以下のようにツールを利用できます：

```
> list_specs
> get_structure { "max_depth": 2 }
> get_section { "section": "7.3.4" }
> search_spec { "query": "digital signature" }
> get_requirements { "section": "12.8", "level": "shall" }
> get_definitions { "term": "font" }
> get_tables { "section": "7.3.4" }
> compare_versions { "section": "12.8" }
```

## アーキテクチャ

```
src/
├── index.ts              # MCP サーバーエントリポイント
├── config.ts             # 設定 & 仕様パターン定義
├── errors.ts             # エラー階層（PDFSpecError → サブクラス）
├── container.ts          # サービスコンテナ（DI 配線）
├── services/
│   ├── pdf-registry.ts       # PDF ファイル自動検出
│   ├── pdf-loader.ts         # LRU キャッシュ付き PDF ローダー
│   ├── pdf-service.ts        # オーケストレーション層
│   ├── compare-service.ts    # バージョン比較
│   ├── outline-resolver.ts   # セクションインデックス構築
│   ├── content-extractor.ts  # 構造化コンテンツ抽出
│   ├── search-index.ts       # 全文検索インデックス
│   ├── requirement-extractor.ts
│   └── definition-extractor.ts
├── tools/
│   ├── definitions.ts    # MCP ツールスキーマ
│   └── handlers.ts       # ツール実装
└── utils/
    ├── concurrency.ts    # mapConcurrent（制限付き並行 Promise.all）
    ├── text.ts           # テキスト正規化
    ├── cache.ts          # LRU キャッシュ
    ├── validation.ts     # 入力バリデーション
    └── logger.ts         # 構造化ロガー
```

## 開発

```bash
git clone https://github.com/shuji-bonji/pdf-spec-mcp.git
cd pdf-spec-mcp
npm install
npm run build

# ユニットテスト（237テスト）
npm run test

# E2Eテスト（212テスト — ./pdf-spec/ に PDF ファイルが必要）
npm run test:e2e

# Lint & フォーマット
npm run lint
npm run format:check
```

## ライセンス

[MIT](LICENSE)
