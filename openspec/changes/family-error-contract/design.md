# Design

## 応答の形

```jsonc
// 引数の誤り（移行の版）
{
  "error": "Invalid requirement level \"definitely-not-a-level\". Valid levels: shall, ...",
  "code": "INVALID_ARGUMENT",
  "retryable": true,
  "detail": { "legacyCode": "VALIDATION_ERROR" }
}

// ハンドラの外の故障
{ "error": "...", "code": "INTERNAL_ERROR", "retryable": false }
```

`detail` は `INVALID_ARGUMENT` のときだけ付きます。名前の変わらないコードには `detail.legacyCode` を付けません。verify は名前の変わらないコードにも付けましたが、それは最上位に旧い項目（`message`・`suggestion`）を残すためでした。spec には残す旧い項目が無いので、旧名の変わったコードだけに付けます（Issue #33 の書き方のとおり）。

## `retryable` の値

| `code` | `retryable` | 作る箇所 |
| --- | --- | --- |
| `INVALID_ARGUMENT` | `true`（既定） | `parseArgs`・`normalizeRequirementLevel` |
| `PREREQUISITE_ERROR` | `false`（既定） | `compare_versions` の仕様書の不足 2 か所 |
| `REGISTRY_ERROR` | `false` | `PDF_SPEC_DIR` が無い・展開されていない・読めない（3 か所。環境を直して起動し直す） |
| `REGISTRY_ERROR` | `true` | 仕様 ID が登録されていない（2 か所。`list_specs` を見て引数を直す） |
| `CONTENT_ERROR` | `true` | 節・表の番号が無い、`get_definitions` が対応していない仕様（4 か所。引数を直す） |
| `INTERNAL_ERROR` | `false` | `PDFSpecError` でない例外 |

`REGISTRY_ERROR` は、同じコードに 2 つの値があります。受け側は `code` だけでは再試行してよいかを決められず、`retryable` を読む必要があります。規約は「`retryable` を常に書く」までしか求めていないので、この変更では値を変えません（proposal の「人が判断すること」）。

## 型で抜けを止める

- `SpecServiceError.retryable` を必須にする
- `RegistryError`・`ContentError` のコンストラクタの `options` で `retryable` を必須にする。`ValidationError`・`ToolPrerequisiteError` は既定値を持つので任意のまま
- `PDFSpecError`（基底）を直接作る箇所は無い。基底の `retryable` は既定 `false` にする

## ライブラリの制約と仕様の制約

- 仕様の制約: なし。エラーの形は MCP の仕様（ツール結果の `isError`）と family の規約で決まり、ISO 32000 の条文には依らない。
- ライブラリの制約: SDK（`@modelcontextprotocol/server`）は、公開した入力スキーマに反する引数をハンドラより前に拒む。その文言は SDK のもので、この変更の対象外（§2.11）。`level` は自由な文字列として公開しているので、値の誤りはハンドラに届き、`INVALID_ARGUMENT` になる。
