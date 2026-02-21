# Example: PDF Specification Translation with DeepL Glossary

Translate the PDF specification (ISO 32000-2) into Japanese with **consistent terminology** by combining `pdf-spec-mcp` and `DeepL MCP Server`.

## The Problem

Without a domain glossary, machine translation produces inconsistent terminology:

| Source term | Without glossary | Expected |
|-------------|-----------------|----------|
| null object | NULLオブジェクト / Nullオブジェクト | **nullオブジェクト** (PDF keyword is lowercase) |
| entries | 項目 / エントリ / エントリー | **エントリー** (consistent) |
| indirect object | 間接的なオブジェクト / 間接オブジェクト | **間接オブジェクト** (consistent) |

This glossary-based workflow solves this.

## Workflow

```
pdf-spec-mcp                          DeepL
┌──────────────┐                     ┌──────────────┐
│get_definitions│── 71 terms ──▶     │              │
│              │               classify & format    │
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
│ get_section  │── English text ──▶  │translate-text│
│ search_spec  │                     │+ glossaryId  │
└──────────────┘                     │    │         │
                                     └────┼─────────┘
                                          ▼
                                   Consistent Japanese
                                   translation
```

## Quick Start

### Prerequisites

- [pdf-spec-mcp](https://www.npmjs.com/package/@shuji-bonji/pdf-spec-mcp) — configured with ISO 32000-2 PDF
- [DeepL MCP Server](https://www.npmjs.com/package/deepl-mcp-server) — configured with API key
- DeepL API key (Free or Pro) — [Get one here](https://www.deepl.com/pro#developer)

### 1. Register the glossary

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

### 2. Translate with the glossary

In your MCP client (Claude Desktop, VS Code, etc.), use the DeepL MCP `translate-text` tool:

```
Tool: translate-text
  text: <English text from pdf-spec-mcp get_section>
  sourceLangCode: "en"
  targetLangCode: "ja"
  glossaryId: "342b99bd-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

## Translation Comparison

Real results from translating ISO 32000-2, Section 7.3.7 "Dictionary objects".

### Test case 1: Paragraph 1

**Source:**

> A dictionary object is an associative table containing pairs of objects, known as the dictionary's entries. The first element of each entry is the key and the second element is the value. The key shall be a name (unlike dictionary keys in the PostScript language, which may be objects of any type). All keys shall be direct objects. The value may be any kind of object, including another dictionary. An indirect reference (see 7.3.10, "Indirect objects") shall be used as the value to refer to a stream object, and may also be used to refer to any other kind of object. A dictionary entry whose value is null (see 7.3.9, "Null object") shall be treated the same as if the entry does not exist.

**❌ Without glossary:**

> 辞書オブジェクトは、辞書の**項目**として知られるオブジェクトのペアを含む連想表である。各エントリの最初の要素がキーで、2番目の要素が値である。キーは名前でなければならない（PostScript言語の辞書キーとは異なり、どのような型のオブジェクトであってもよい）。すべてのキーは直接オブジェクトでなければならない。値は，別の辞書を含め，どのような種類のオブジェクトであってもよい。間接参照(7.3.10 "間接オブジェクト"を参照)は，ストリームオブジェクトを参照する値として使用しなければならない。値が**NULL**である辞書**項目**（7.3.9「**Null**オブジェクト」参照）は、その項目が存在しないのと同じように扱われるものとする。

**✅ With glossary:**

> 辞書オブジェクトは、辞書の**エントリー**と呼ばれるオブジェクトのペアを含む連想表である。各エントリの最初の要素がキーで、2番目の要素が値である。キーは名前でなければならない（PostScript言語の辞書キーとは異なり、どのような型のオブジェクトであってもよい）。すべてのキーは直接オブジェクトでなければならない。値は，別の辞書を含め，どのようなオブジェクトであってもよい。間接参照(7.3.10, "間接オブジェクト"を参照)を，ストリームオブジェクトを参照する値として使用しなければならない。値が**null**である辞書項目（7.3.9「**null**オブジェクト」参照）は、その項目が存在しないのと同じように扱われるものとする。

### Test case 2: Paragraph 2

**Source:**

> Dictionary objects are the main building blocks of a PDF file. They are commonly used to collect and tie together the attributes of a complex object, such as a font or a page of the document, with each entry in the dictionary specifying the name and value of an attribute.

**❌ Without glossary:**

> 辞書オブジェクトは、PDFファイルの主要な構成要素です。辞書の各項目は、属性の名前と値を指定します。

⚠️ **Second sentence completely dropped** — "They are commonly used to collect and tie together the attributes of a complex object, such as a font or a page of the document" is missing.

**✅ With glossary:**

> 辞書オブジェクトはPDFファイルの主要な構成要素です。辞書オブジェクトは、フォントや文書のページなど、複雑なオブジェクトの属性を集めて結びつけるために一般的に使用され、辞書の各項目は属性の名前と値を指定します。

✅ Full translation with no missing content.

### Summary of improvements

| Aspect | ❌ Without Glossary | ✅ With Glossary | Impact |
|--------|-------------------|-----------------|--------|
| `null` keyword | `NULL` / `Null` (inconsistent) | `null` (consistent) | Correct PDF keyword casing |
| "entries" | 項目 (generic Japanese) | エントリー (PDF term) | Terminology consistency |
| Sentence omission | Second sentence **dropped** | Fully translated | Prevents information loss |
| "abbreviated" | 略される | 省略される | More precise translation |

## How the Glossary Was Built

### Step 1: Extract terms from the specification

Using `pdf-spec-mcp`'s `get_definitions` tool, 71 terms were extracted from ISO 32000-2, Section 3 "Terms and definitions".

### Step 2: Classify terms

Each term was classified into one of two categories:

**Keep as-is (15 terms)** — Acronyms and proper names that should not be translated:

```
ASCII, ASN.1, CAdES, DSA, JPEG, PAdES, PKCS #7, PRC, RDF, SHA, sRGB, TIFF, UCS, U3D, XMP
```

**Translate (56 terms)** — Terms needing consistent Japanese translations. See [pdf-spec-glossary-en-ja.tsv](./pdf-spec-glossary-en-ja.tsv).

### Step 3: Apply domain expertise

This classification requires human judgment. AI extracts the terms; domain expertise decides how to translate them:

- `null object` → `nullオブジェクト` (not `NULLオブジェクト`) — PDF's `null` is a lowercase keyword
- `FDF file` → `FDFファイル` — natural in Japanese technical context
- `deprecated` → `非推奨` (not katakana `デプリケーテッド`) — native Japanese is clearer

## Files

| File | Description |
|------|-------------|
| `pdf-spec-glossary-en-ja.tsv` | 56-entry EN→JA glossary in DeepL TSV format |
| `create-glossary.sh` | Registers the glossary with DeepL API (Free/Pro auto-detection) |
| `README.md` | This document |

## Adapting for Other Languages

1. Copy `pdf-spec-glossary-en-ja.tsv` as a template
2. Replace the Japanese translations with your target language
3. Update `TARGET_LANG` in `create-glossary.sh`

The 15 "keep as-is" terms (ASCII, CAdES, etc.) are universal — only the translated terms need localization.

## Limitations

- **DeepL MCP Server** currently provides glossary **read** tools but lacks **write** tools. The `create-glossary.sh` script works around this by calling the DeepL API directly. See [deepl-mcp-server#31](https://github.com/DeepLcom/deepl-mcp-server/issues/31).
- **Glossary scope**: Covers terms from ISO 32000-2, Section 3. Specialized terms from specific chapters (e.g., digital signature algorithms, font encoding names) may need additional entries.
- **One direction**: DeepL glossaries are unidirectional. This glossary is EN→JA only.

## License

MIT — Same as [pdf-spec-mcp](https://github.com/shuji-bonji/pdf-spec-mcp).
