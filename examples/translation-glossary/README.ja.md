# 活用例: DeepL グロッサリーを使った PDF 仕様書の翻訳

`pdf-spec-mcp` と `DeepL MCP Server` を組み合わせて、PDF仕様書（ISO 32000-2）を**用語統一された日本語**に翻訳するワークフローです。

## 課題

ドメイン用語のグロッサリーなしで機械翻訳すると、用語がブレます：

| 原文 | グロッサリーなし | 期待される訳 |
|------|----------------|-------------|
| null object | NULLオブジェクト / Nullオブジェクト | **nullオブジェクト**（PDFキーワードは小文字） |
| entries | 項目 / エントリ / エントリー | **エントリー**（統一） |
| indirect object | 間接的なオブジェクト / 間接オブジェクト | **間接オブジェクト**（統一） |

このワークフローはグロッサリーベースでこの問題を解決します。

## ワークフロー

```
pdf-spec-mcp                          DeepL
┌──────────────┐                     ┌──────────────┐
│get_definitions│── 71用語 ──▶       │              │
│              │              分類 & TSV整形        │
└──────────────┘                  │  │              │
                                 TSV │              │
                                  │  │              │
                    create-glossary.sh│              │
                                  └─▶│POST /v2/     │
                                     │ glossaries   │
                                     │    │         │
                                     │ glossary_id  │
                                     │    │         │
┌──────────────┐                     │    ▼         │
│ get_section  │── 英語テキスト ──▶  │translate-text│
│ search_spec  │                     │+ glossaryId  │
└──────────────┘                     │    │         │
                                     └────┼─────────┘
                                          ▼
                                     用語統一された
                                     日本語翻訳
```

## クイックスタート

### 前提条件

- [pdf-spec-mcp](https://www.npmjs.com/package/@shuji-bonji/pdf-spec-mcp) — ISO 32000-2 の PDF を設定済み
- [DeepL MCP Server](https://www.npmjs.com/package/deepl-mcp-server) — APIキーを設定済み
- DeepL API キー（Free または Pro）— [取得はこちら](https://www.deepl.com/pro#developer)

### 1. グロッサリーを登録する

```bash
export DEEPL_API_KEY="your-key-here"
bash create-glossary.sh
```

```
📡 DeepL Pro API を使用
📝 PDF Spec ISO32000-2 EN-JA（56エントリ）を登録中...

✅ 登録成功!
   glossary_id: 342b99bd-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   name: PDF Spec ISO32000-2 EN-JA
   entry_count: 56
```

### 2. グロッサリーを使って翻訳する

MCPクライアント（Claude Desktop、VS Code など）で DeepL MCP の `translate-text` ツールを使用：

```
Tool: translate-text
  text: <pdf-spec-mcp の get_section で取得した英語テキスト>
  sourceLangCode: "en"
  targetLangCode: "ja"
  glossaryId: "342b99bd-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

## 翻訳品質の比較

ISO 32000-2 セクション 7.3.7 "Dictionary objects" を実際に翻訳した結果です。

### テストケース 1: 第1段落

**原文:**

> A dictionary object is an associative table containing pairs of objects, known as the dictionary's entries. The first element of each entry is the key and the second element is the value. The key shall be a name (unlike dictionary keys in the PostScript language, which may be objects of any type). All keys shall be direct objects. The value may be any kind of object, including another dictionary. An indirect reference (see 7.3.10, "Indirect objects") shall be used as the value to refer to a stream object, and may also be used to refer to any other kind of object. A dictionary entry whose value is null (see 7.3.9, "Null object") shall be treated the same as if the entry does not exist.

**❌ グロッサリーなし:**

> 辞書オブジェクトは、辞書の**項目**として知られるオブジェクトのペアを含む連想表である。各エントリの最初の要素がキーで、2番目の要素が値である。キーは名前でなければならない（PostScript言語の辞書キーとは異なり、どのような型のオブジェクトであってもよい）。すべてのキーは直接オブジェクトでなければならない。値は，別の辞書を含め，どのような種類のオブジェクトであってもよい。間接参照(7.3.10 "間接オブジェクト"を参照)は，ストリームオブジェクトを参照する値として使用しなければならない。値が**NULL**である辞書**項目**（7.3.9「**Null**オブジェクト」参照）は、その項目が存在しないのと同じように扱われるものとする。

**✅ グロッサリーあり:**

> 辞書オブジェクトは、辞書の**エントリー**と呼ばれるオブジェクトのペアを含む連想表である。各エントリの最初の要素がキーで、2番目の要素が値である。キーは名前でなければならない（PostScript言語の辞書キーとは異なり、どのような型のオブジェクトであってもよい）。すべてのキーは直接オブジェクトでなければならない。値は，別の辞書を含め，どのようなオブジェクトであってもよい。間接参照(7.3.10, "間接オブジェクト"を参照)を，ストリームオブジェクトを参照する値として使用しなければならない。値が**null**である辞書項目（7.3.9「**null**オブジェクト」参照）は、その項目が存在しないのと同じように扱われるものとする。

### テストケース 2: 第2段落

**原文:**

> Dictionary objects are the main building blocks of a PDF file. They are commonly used to collect and tie together the attributes of a complex object, such as a font or a page of the document, with each entry in the dictionary specifying the name and value of an attribute.

**❌ グロッサリーなし:**

> 辞書オブジェクトは、PDFファイルの主要な構成要素です。辞書の各項目は、属性の名前と値を指定します。

⚠️ **第2文が丸ごと欠落** — 「フォントや文書のページなど、複雑なオブジェクトの属性を集めて結びつけるために一般的に使用され」の部分がありません。

**✅ グロッサリーあり:**

> 辞書オブジェクトはPDFファイルの主要な構成要素です。辞書オブジェクトは、フォントや文書のページなど、複雑なオブジェクトの属性を集めて結びつけるために一般的に使用され、辞書の各項目は属性の名前と値を指定します。

✅ 欠落なし、完全な翻訳。

### 改善まとめ

| 観点 | ❌ グロッサリーなし | ✅ グロッサリーあり | 影響 |
|------|-------------------|-----------------|------|
| `null` キーワード | `NULL` / `Null`（不統一） | `null`（統一） | PDF仕様のキーワード表記に準拠 |
| "entries" の訳 | 項目（汎用語） | エントリー（PDF用語） | 用語の一貫性 |
| 文の欠落 | 第2文が**欠落** | 完全に翻訳 | 情報欠損の防止 |
| "abbreviated" の訳 | 略される | 省略される | より正確な訳語 |

## グロッサリーの構築手順

### ステップ 1: 仕様書から用語を抽出

`pdf-spec-mcp` の `get_definitions` ツールで、ISO 32000-2 セクション 3「用語及び定義」から 71 用語を抽出しました。

### ステップ 2: 用語を分類

各用語を2カテゴリに分類しました：

**そのまま保持（15用語）** — 翻訳不要の略語・固有名：

```
ASCII, ASN.1, CAdES, DSA, JPEG, PAdES, PKCS #7, PRC, RDF, SHA, sRGB, TIFF, UCS, U3D, XMP
```

**対訳指定（56用語）** — 一貫した日本語訳が必要な用語。[pdf-spec-glossary-en-ja.tsv](./pdf-spec-glossary-en-ja.tsv) を参照。

### ステップ 3: ドメイン知識を適用

この分類には人間の判断が必要です。**AIが用語を抽出し、ドメイン知識がどう訳すかを決める**：

- `null object` → `nullオブジェクト`（`NULLオブジェクト` ではない）— PDF の `null` は小文字のキーワード
- `FDF file` → `FDFファイル` — 日本語の技術文脈で自然
- `deprecated` → `非推奨`（カタカナ「デプリケーテッド」ではない）— 開発者にとって明確

## ファイル構成

| ファイル | 説明 |
|---------|------|
| `pdf-spec-glossary-en-ja.tsv` | 56エントリの EN→JA グロッサリー（DeepL TSV形式） |
| `create-glossary.sh` | DeepL API へのグロッサリー登録スクリプト（Free/Pro 自動判定） |
| `README.md` | 英語版ドキュメント |
| `README.ja.md` | このドキュメント |

## 他言語への応用

1. `pdf-spec-glossary-en-ja.tsv` をテンプレートとしてコピー
2. 日本語訳を対象言語に置き換える
3. `create-glossary.sh` の `TARGET_LANG` を変更

「そのまま保持」の15用語（ASCII、CAdES 等）は言語共通です。対訳指定の用語のみローカライズが必要です。

## 制約事項

- **DeepL MCP Server** はグロッサリーの**読み取り**ツールのみ提供しており、**書き込み**ツール（作成・更新・削除）がありません。`create-glossary.sh` は DeepL API を直接呼び出すことでこの制約を回避しています。参照: [deepl-mcp-server#31](https://github.com/DeepLcom/deepl-mcp-server/issues/31)
- **グロッサリーの範囲**: ISO 32000-2 セクション 3 の定義用語をカバーしています。特定の章の専門用語（電子署名アルゴリズム、フォントエンコーディング名など）は追加エントリが必要な場合があります。
- **一方向**: DeepL グロッサリーは単方向です。本グロッサリーは EN→JA のみ対応。

## ライセンス

MIT — [pdf-spec-mcp](https://github.com/shuji-bonji/pdf-spec-mcp) と同一。
