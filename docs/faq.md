## Q: 汎用PDFリーダーで仕様書PDFを読めば同じでは？

## A: 汎用 PDF リーダーで同じことをする場合

仮に `@fabriqa.ai/pdf-reader-mcp` で ISO 32000-2 の PDF を開いたとすると：

**ステップ1：** まずどのページに「digital signature」があるか分からない。全文検索するか、目次を探す必要がある

**ステップ2：** PDF 全体は **1,000ページ超**。全文読み込みはコンテキストウィンドウに収まらない

**ステップ3：** ページ範囲を指定して抽出しても、返ってくるのは **生テキスト**：

```
ISO 32000-2:2020(E)
© ISO 2020 – All rights reserved 567
12.8 Digital signatures
12.8.1 General
A digital signature (PDF 1.3) may be used to verify the integrity of the
document's contents using verification information related to a signer.
The signature may be purely mathematical, such as a public/private-key
encrypted document digest, or it may be a biometric form of identification,
...
```

ヘッダー、フッター、ページ番号が混在し、テーブルは崩れ、リストは区別できない。

---

## 比較まとめ

|                                         | 汎用PDFリーダー                             | pdf-spec-mcp                                    |
| --------------------------------------- | ------------------------------------------- | ----------------------------------------------- |
| **「12.8のセクションを見たい」**        | ページ番号を知っている必要がある            | `get_section("12.8")` で即取得                  |
| **「digital signatureの仕様はどこ？」** | 全文検索 → 大量の生テキスト                 | `search_spec` → セクション番号+スコア           |
| **返却形式**                            | 生テキスト（改行・ヘッダ混在）              | 構造化JSON（heading/paragraph/list/note/table） |
| **トークン消費**                        | ページ単位（無関係な内容含む）              | セクション単位（必要な部分のみ）                |
| **セクション間ナビゲーション**          | 不可（手動でページ探索）                    | セクション番号で直接ジャンプ                    |
| **テーブル認識**                        | 崩壊（スペース区切りの文字列）              | テーブルとして構造化（Phase 2）                 |
| **要件抽出（MUST/SHOULD）**             | 不可能                                      | `get_requirements`（Phase 2）                   |
| **前提知識**                            | PDF仕様書のページ構成を知っている必要がある | 不要（検索→セクション参照のフロー）             |

核心は **「1,000ページの仕様書にセマンティックなインデックスが張られているかどうか」** です。汎用PDFリーダーはただのテキスト抽出器なので、「セクション 12.8」「Table 255」「MUST 要件」といった**仕様書固有の構造を理解しない**。

これはちょうど、データベースに対して「全テーブルをCSVダンプして grep する」のと「SQLでクエリする」の違いに近いと思います。
