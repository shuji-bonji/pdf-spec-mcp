# PDF解析ライブラリ比較レポート

> ISO_32000-2_sponsored-ec2.pdf (1,020ページ) でのベンチマーク結果
> Date: 2026-02-07

## 1. ベンチマーク結果

### 1.1 パフォーマンス

| 項目 | pdfjs-dist | mupdf | pdf2json |
|------|-----------|-------|---------|
| ロード時間 | 149 ms | **26 ms** | タイムアウト (300s+) |
| アウトライン取得 | 31 ms | **22 ms** | N/A |
| ページ解決 (50件) | 1 ms | **不要** (直接取得) | N/A |
| 1ページ テキスト抽出 | 71 ms | **46 ms** | N/A |
| 10ページ テキスト抽出 | 64 ms | **35 ms** | N/A |

### 1.2 テキスト抽出品質

#### pdfjs-dist

```
[439,795] h=12 "I"
[443,795] h=12 "SO 32000"       ← 単語が分割される場合あり
[72,44]   h=9  "©"
```

- テキスト要素単位（単語〜フレーズ）
- `transform[4]`=x, `transform[5]`=y, `height`≈フォントサイズ
- フォント名は取得不可（フォント情報は別途取得が必要）

#### mupdf

```
y=47  x=439 size=12 font=BCDEEE+Cambria-Bold  "ISO 32000-2:2020(E)"
y=102 x=72  size=13 font=BCDEEE+Cambria-Bold  "7.3.4 String objects"
y=130 x=72  size=12 font=BCDEEE+Cambria-Bold  "7.3.4.1 General"
y=156 x=72  size=11 font=BCDFEE+Cambria        "A string object shall..."
```

- 文字単位の位置情報 → 行単位に集約可能
- **フォント名・サイズが直接取得可能**
- ボールド判定が容易: `Cambria-Bold` vs `Cambria`
- セクション見出し検出: フォントサイズ (13pt) + ボールド

#### pdf2json

- 1,020ページPDFの処理に **300秒以上** かかり実用外

### 1.3 アウトライン (ブックマーク)

#### pdfjs-dist

```js
// 2段階の解決が必要
// 形式1: Array dest → doc.getPageIndex(dest[0]) + 1
// 形式2: String dest → doc.getDestination(name) → doc.getPageIndex()
outline[i].title  // "7 Syntax"
outline[i].items  // 子アウトライン
```

#### mupdf

```js
// ページ番号が直接取得可能
outline[i].title  // "7 Syntax"
outline[i].page   // 34 (0-based)
outline[i].down   // 子アウトライン
outline[i].uri    // "#page=35&zoom=100,69,90"
```

---

## 2. 候補ライブラリ一覧

| ライブラリ | バージョン | DL/週 | ライセンス | 位置情報テキスト | アウトライン | 備考 |
|-----------|----------|-------|---------|------------|-----------|------|
| **pdfjs-dist** | 5.4.x | 2,000K | Apache-2.0 | OK (要素単位) | OK (2形式) | Mozilla公式 |
| **mupdf** | 1.27.0 | 31K | **AGPL-3.0** | OK (文字単位+フォント) | OK (直接) | WASM, 最速 |
| pdf2json | 4.0.2 | 250K | Apache-2.0 | OK (独自座標系) | NG | 大規模PDF不可 |
| unpdf | 1.4.0 | 65K | MIT | pdfjs-dist経由 | pdfjs-dist経由 | ラッパーのみ |
| pdf.js-extract | 0.2.1 | 108K | MIT | OK | NG | メンテ停止 |
| pdfreader | 3.0.8 | 28K | MIT | OK (独自座標系) | NG | pdf2json依存 |
| pdf-lib | 1.17.1 | 500K | MIT | NG | NG | 生成専用 |
| pdf-parse v4 | 2.4.5 | - | - | NG (ページ指定無視) | 部分的 | テーブル抽出0件 |

---

## 3. 評価

### 3.1 pdfjs-dist (Apache-2.0)

**長所:**
- 圧倒的な採用実績 (週200万DL)
- Apache-2.0 ライセンス（制約なし）
- アウトライン + テキスト + 位置情報が全て取得可能
- Mozilla が継続メンテナンス

**短所:**
- アウトライン→ページ解決に2形式対応が必要
- テキスト要素が単語〜フレーズ単位で粒度が不均一
- フォント名の直接取得が困難
- ESM only (legacy ビルド使用)

### 3.2 mupdf (AGPL-3.0)

**長所:**
- 最速 (C言語エンジンのWASMビルド)
- フォント名・サイズが直接取得 → セクション見出し検出が容易
- アウトラインにページ番号が直接含まれる (解決不要)
- 文字単位の位置情報 → テーブル再構成に有利

**短所:**
- **AGPL-3.0 ライセンス** → OSSプロジェクトなら問題なし、商用は要注意
- WASM バイナリ (~10-15MB)
- コミュニティが小さい (週31K DL)

---

## 4. 推奨

### 第一候補: pdfjs-dist

```
理由:
- Apache-2.0 でライセンスの懸念なし
- rfcxml-mcp 等の既存エコシステムとの親和性
- 十分な性能 (149ms ロード、10ページ 64ms)
- 最も広く使われており、ドキュメント・情報が豊富
```

### 代替候補: mupdf

```
理由:
- 技術的には最強 (速度、フォント情報、アウトライン直接解決)
- AGPL はこのプロジェクト (MIT/ISC 想定) と相性が悪い可能性
- ただし、pdf-spec-mcp 自体を AGPL にするなら問題なし
```

### 最終判断のポイント

| 判断基準 | pdfjs-dist | mupdf |
|---------|-----------|-------|
| ライセンス自由度 | **Apache-2.0** | AGPL-3.0 |
| 速度 | Good (149ms) | **Best (26ms)** |
| フォント情報 | 困難 | **容易** |
| テーブル再構成 | 要素単位 → 工夫要 | **文字単位 → 精密** |
| エコシステム互換性 | **高い** | 低い |
| メンテナンス安定性 | **Mozilla** | Artifex |

> **結論**: ライセンスの方針次第。MIT/Apache で公開するなら **pdfjs-dist**、AGPL を許容するなら **mupdf** が最適。

---

## 5. 追加検証: pdfjs-dist の隠れた機能

### 5.1 `getStructTree()` — Tagged PDF 構造ツリー

ISO 32000-2 は **Tagged PDF** であり、pdfjs-dist の `page.getStructTree()` で
セマンティック構造が完全に取得できることが判明:

```
<H3> "7.3.4 String objects"          ← セクション見出し
<H4> "7.3.4.1 General"              ← サブセクション
<P>  "A string object shall..."      ← 段落
<L>                                  ← リスト
  <LI> "• As a sequence of..."
<Table>                              ← テーブル！
  <TR>
    <TH> <P> "Sequence"
    <TH> <P> "Meaning"
  <TR>
    <TH> <P> "\n"
    <TD> <P> "LINE FEED (0Ah) (LF)"
```

**影響**:
- フォント情報によるセクション判別 → **不要** (H1-H6 タグで直接判別)
- x座標クラスタリングによるテーブル再構成 → **不要** (Table/TR/TH/TD で構造化済み)

### 5.2 `includeMarkedContent: true`

`getTextContent({ includeMarkedContent: true })` で Tagged PDF のマークが取得可能。
`getStructTree()` の content ID とテキストアイテムが紐付けられる。

- `<Artifact>` タグ → ヘッダー/フッター (除外対象)
- `<Span>` タグ → テキスト内容のブロック

### 5.3 `textContent.styles`

各フォントIDのスタイル情報が取得可能:

```js
textContent.styles = {
  'g_d0_f1': { fontFamily: 'serif', ascent: 0.95, descent: -0.22 },     // 見出し
  'g_d0_f2': { fontFamily: 'serif', ascent: 0.95, descent: -0.22 },     // 本文
  'g_d0_f5': { fontFamily: 'sans-serif', ... },                          // リスト
  'g_d0_f8': { fontFamily: 'monospace', ... },                           // コード
}
```

### 5.4 更新された比較

| 機能 | pdfjs-dist (追加検証後) | mupdf |
|------|----------------------|-------|
| セクション見出し検出 | **H1-H6 タグで直接判別** | フォント名で判別 |
| テーブル抽出 | **Table/TR/TH/TD 構造** | x座標クラスタリング |
| ヘッダー/フッター除外 | **Artifact タグ** | y座標フィルタ |
| フォント種別 | serif/sans-serif/monospace | 実フォント名 |
| ライセンス | **Apache-2.0** | AGPL-3.0 |

> **最終結論**: pdfjs-dist の Tagged PDF サポート (`getStructTree()`) により、
> mupdf の優位性であった「フォント情報によるセクション検出」と「テーブル抽出」が
> **StructuredText のセマンティック情報で代替可能**となった。
>
> **推奨: pdfjs-dist を採用**
> - Tagged PDF 構造でセクション・テーブルを直接取得
> - Apache-2.0 ライセンスで制約なし
> - 十分な性能 (149ms ロード)
