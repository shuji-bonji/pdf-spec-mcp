---
name: deepl-glossary-management
description: DeepL MCP Serverでグロッサリーの作成・更新・削除が必要な場合に使用する。DeepL MCPにはグロッサリー書き込み系ツールが存在しないため、本SkillがDeepL APIを直接呼び出す手順を提供する。トリガー条件：用語集の作成、グロッサリーの登録・更新・削除、翻訳の用語統一、専門用語の一貫性確保が求められる場合。
---

# DeepL Glossary Management via API

DeepL MCP Server にはグロッサリーの作成・更新・削除ツールが存在しない（2025年2月時点）。
本 Skill は DeepL API を直接呼び出すことで、この機能ギャップを埋める。

## 前提条件

- 環境変数 `DEEPL_API_KEY` が設定されていること
- DeepL API Free または Pro アカウント

## API エンドポイント

- Free: `https://api-free.deepl.com`
- Pro: `https://api.deepl.com`

APIキーが `:fx` で終わる場合は Free、それ以外は Pro。

---

## 1. グロッサリー作成

```bash
curl -s -X POST "${DEEPL_API_BASE:-https://api-free.deepl.com}/v3/glossaries" \
  -H "Authorization: DeepL-Auth-Key $DEEPL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "<グロッサリー名>",
    "dictionaries": [{
      "source_lang": "<ソース言語コード>",
      "target_lang": "<ターゲット言語コード>",
      "entries": "<TSV形式のエントリ>",
      "entries_format": "tsv"
    }]
  }'
```

### レスポンス例
```json
{
  "glossary_id": "def3a26b-3e84-...",
  "name": "PDF Spec EN-JA",
  "dictionaries": [{ "source_lang": "en", "target_lang": "ja", "entry_count": 56 }],
  "creation_time": "2025-02-21T..."
}
```

**重要**: 返却された `glossary_id` を記録すること。翻訳時に必要。

---

## 2. グロッサリーのエントリを上書き更新

既存グロッサリーの辞書を丸ごと置き換える：

```bash
curl -s -X PUT "${DEEPL_API_BASE:-https://api-free.deepl.com}/v3/glossaries/<glossary_id>/dictionaries" \
  -H "Authorization: DeepL-Auth-Key $DEEPL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "source_lang": "<ソース言語コード>",
    "target_lang": "<ターゲット言語コード>",
    "entries": "<TSV形式のエントリ>",
    "entries_format": "tsv"
  }'
```

---

## 3. グロッサリー削除

```bash
curl -s -X DELETE "${DEEPL_API_BASE:-https://api-free.deepl.com}/v3/glossaries/<glossary_id>" \
  -H "Authorization: DeepL-Auth-Key $DEEPL_API_KEY"
```

---

## 4. 翻訳時のグロッサリー利用

DeepL MCP の `translate-text` ツールで `glossaryId` パラメータを指定する：

```
translate-text:
  text: "<翻訳対象テキスト>"
  sourceLangCode: "en"
  targetLangCode: "ja"
  glossaryId: "<glossary_id>"
```

**注意**: グロッサリー使用時は `sourceLangCode` の指定が必須。

---

## TSV 形式の注意事項

- 1行1エントリ、タブ区切り（ソース語\tターゲット語）
- JSON 内に埋め込む場合、タブは `\t`、改行は `\n` にエスケープ
- エントリ内にタブや改行を含めないこと

## TSVファイルからJSONエスケープ文字列を生成

```bash
# TSVファイルを JSON 用にエスケープ
cat <glossary.tsv> | sed ':a;N;$!ba;s/\n/\\n/g' | sed 's/\t/\\t/g'
```

---

## 利用可能なグロッサリー

| 名前 | glossary_id | 言語ペア | エントリ数 | 用途 |
|------|-------------|----------|-----------|------|
| *(登録後に記入)* | | | | |

> このテーブルはグロッサリー作成後に更新すること。
> `list-glossaries` ツール（DeepL MCP）で既存グロッサリーを確認可能。
