# docs/reference

pdf-spec-mcp の設計・検証時に参照する外部資料の置き場。**ここの PDF は `.gitignore` で追跡対象外**（バイナリをリポジトリに入れない方針。`docs/reference/*.pdf`）。

## 収録（各自で入手して配置）

| ファイル | 内容 | 入手元 / ライセンス |
|---|---|---|
| `TechNote0010.pdf` | PDF Association TechNote 0010: Clarifications of ISO 19005, parts 1–3 for developers of PDF/A creators and validators（PDF/A の曖昧点 29 件の解決。veraPDF 開発の文脈で作成） | [pdfa.org](https://pdfa.org/resource/technote-0010-clarifications-of-iso-19005-parts-1-3-for-developers-of-pdfa-creators-and-validators) / **CC-BY 4.0** |

## 注意

- これらは **`PDF_SPEC_DIR`（`pdf-spec/`）のコーパスとは別**。コーパスは ISO 標準原本（`SPEC_PATTERNS` で自動発見される ISO 32000 系）だけを置く。TechNote 等の解説資料はここ（参照専用・MCP からは引かれない）。
- ISO 19005（PDF/A）本体はまだコーパスに無い（PDF/A は現状 T2）。購入して T1 化する判断は `Document-Note/mcps/PDFfamily/specs/15-kickoff-b8-pdfa.md` を参照。
