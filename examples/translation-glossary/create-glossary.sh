#!/bin/bash
# =============================================================================
# create-glossary.sh
# Register PDF specification glossary (EN→JA) with DeepL API
# =============================================================================

set -euo pipefail

# --- Configuration ---
GLOSSARY_NAME="PDF Spec ISO32000-2 EN-JA"
SOURCE_LANG="en"
TARGET_LANG="ja"
TSV_FILE="$(dirname "$0")/pdf-spec-glossary-en-ja.tsv"

# --- Validate prerequisites ---
if [ -z "${DEEPL_API_KEY:-}" ]; then
  echo "❌ DEEPL_API_KEY が設定されていません"
  echo ""
  echo "使い方:"
  echo "  export DEEPL_API_KEY=\"your-key-here\""
  echo "  bash create-glossary.sh"
  echo ""
  echo "APIキーの取得: https://www.deepl.com/pro#developer"
  exit 1
fi

if [ ! -f "$TSV_FILE" ]; then
  echo "❌ TSVファイルが見つかりません: $TSV_FILE"
  exit 1
fi

# --- Detect API endpoint (Free vs Pro) ---
# Free API keys end with ":fx"
if [[ "$DEEPL_API_KEY" == *":fx" ]]; then
  API_BASE="https://api-free.deepl.com"
  echo "📡 DeepL Free API を使用"
else
  API_BASE="https://api.deepl.com"
  echo "📡 DeepL Pro API を使用"
fi

# --- Read TSV content ---
ENTRIES=$(cat "$TSV_FILE")
ENTRY_COUNT=$(echo "$ENTRIES" | wc -l | tr -d ' ')

echo "📝 ${GLOSSARY_NAME}（${ENTRY_COUNT}エントリ）を登録中..."
echo ""

# --- Create glossary ---
RESPONSE=$(curl -s -X POST "${API_BASE}/v2/glossaries" \
  -H "Authorization: DeepL-Auth-Key ${DEEPL_API_KEY}" \
  -H "Content-Type: application/json" \
  -d @- <<EOF
{
  "name": "${GLOSSARY_NAME}",
  "source_lang": "${SOURCE_LANG}",
  "target_lang": "${TARGET_LANG}",
  "entries_format": "tsv",
  "entries": $(echo "$ENTRIES" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')
}
EOF
)

# --- Check result ---
GLOSSARY_ID=$(echo "$RESPONSE" | python3 -c "import json,sys; print(json.load(sys.stdin).get('glossary_id',''))" 2>/dev/null || true)

if [ -n "$GLOSSARY_ID" ]; then
  echo "✅ 登録成功!"
  echo "   glossary_id: ${GLOSSARY_ID}"
  echo "   name: ${GLOSSARY_NAME}"
  echo "   entry_count: ${ENTRY_COUNT}"
  echo ""
  echo "📋 使い方（DeepL MCP）:"
  echo "   translate-text ツールで glossaryId: \"${GLOSSARY_ID}\" を指定"
  echo ""
  echo "📋 使い方（curl）:"
  echo "   curl -X POST '${API_BASE}/v2/translate' \\"
  echo "     -H 'Authorization: DeepL-Auth-Key \${DEEPL_API_KEY}' \\"
  echo "     -d 'text=Your text here' \\"
  echo "     -d 'source_lang=EN' -d 'target_lang=JA' \\"
  echo "     -d 'glossary_id=${GLOSSARY_ID}'"
else
  echo "❌ 登録失敗"
  echo "Response: $RESPONSE"
  exit 1
fi
