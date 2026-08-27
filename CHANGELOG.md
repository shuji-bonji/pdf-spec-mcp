# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.0] - 2026-08-27

Infrastructure only: no tool gained or lost a capability, and no tool's output
changed. Three things reach callers — read **Changed** before upgrading.

### Changed

- **MCP SDK v1 → v2** (`@modelcontextprotocol/sdk@^1.26.0` →
  `@modelcontextprotocol/server@^2.0.0`). One difference reaches callers: a
  `tools/call` naming a tool this server does not have now comes back as a
  **JSON-RPC error** (code `-32602`), where v1 returned a tool result with
  `isError: true`. Client code that only reads `isError` will not see it, and
  `await client.callTool(...)` throws instead of resolving. Failures of input
  validation — a missing required argument, a key the schema does not declare —
  still arrive as `isError: true`.
- **Arguments the input schema does not declare are now rejected.** All 8 tools
  take a `.strict()` object, so an undeclared key fails the call with
  `-32602 Unrecognized key`. Until now such a key was silently dropped and the
  call ran (zod's default for an object is *strip*, not *strict*).
- **`inputSchema` in `tools/list` changed in two ways, for all 8 tools**:
  `$schema` is now `https://json-schema.org/draft/2020-12/schema` (was
  draft-07), and `additionalProperties: false` is now stated (it was absent).
  Tool names, descriptions and `required` are unchanged — measured tool by tool
  against 0.5.0 with `scripts/tools-list-snapshot.mjs`, which speaks raw
  JSON-RPC over stdio rather than using an SDK client.
- `zod` is declared as `^4.2.0` — the version all four servers in the family
  now share. `typescript` moves to `^7.0.2` (a devDependency).

### Added

- `npm run check:public-types` fails if a type from the MCP SDK or from zod
  appears in the published `.d.ts`. The published surface must not force a
  consumer onto our versions of those.
- `npm run check:engines` compares `engines.node` against what the dependency
  tree asks for. `pdfjs-dist` is recorded in `engineExceptions` with the
  measurement behind the exception: it declares `>=22.13.0 || >=24` for the
  whole package, but this server reads the legacy build, which ships core-js
  and defines `Promise.withResolvers` itself. Measured on Node 20.20.2 and
  22.22.2 across `getDocument` / `numPages` / `getOutline` / `getTextContent` /
  `getStructTree` / `getPageIndex`, same results.

### Notes

- `engines.node` is unchanged: `>=20.0.0`.

## [0.5.0] - 2026-08-25

### Added

- **On-disk index cache (Issue #6).** The two whole-document operations — the search index
  built by the first `search_spec` on a spec, and the full scan behind `get_requirements`
  without a `section` — are now written to disk after they are built and read back by every
  later process. Measured on ISO 32000-2 (1023 pages) in a 2-CPU sandbox: search 24.3 s →
  0.16 s, requirements 51.0 s → 0.02 s, with the index byte-for-byte identical (a laptop is
  roughly 4× faster on both sides). Nothing about searching changed: the same in-memory
  structure is walked by the same code; only where it comes from does.

  - Location: `${PDF_SPEC_CACHE_DIR:-${XDG_CACHE_HOME:-~/.cache}/pdf-spec-mcp}/v1/<version>/<spec>.<kind>.<sha16>.json`,
    ~18 MB for the 17-spec corpus. Plain JSON of the existing `TextIndex.pages` and
    `Requirement[]` — no new dependency, no database.
  - Key: package version, `pdfjs-dist` version, spec id, SHA-256 of the PDF. The package
    version is in the key on purpose — 0.4.2, 0.4.3 and 0.4.5 each changed how pages are cut
    into sections, and a cache keyed on the PDF alone would have kept serving the pre-fix
    index after every one of those upgrades. The pdfjs version is there because the installed
    pdfjs drifts from `package.json`'s range between installs.
  - Any failure is a miss, never an error: absent, truncated, foreign-version or
    wrong-shaped files are rebuilt; an unwritable directory is reported once and the server
    runs without a cache. Writes are tmp + rename, so concurrent processes cannot corrupt
    each other. `PDF_SPEC_CACHE=off` disables it.
  - `PDFSpecService` takes the store as a third constructor argument (`IndexStore`), so tests
    share one store between two instances and prove the second never touches the loader.
- **CLI:** `pdf-spec-mcp --build-cache [--spec=a,b] [--force]` builds every spec's indexes
  sequentially through the same code path the tools use and exits (about a minute for the
  corpus on a laptop); `--cache-info` lists the directory, the current key and the entries;
  `--clear-cache` removes the directory. Without a flag the binary starts the MCP server as
  before.

### Changed

- `search_spec`'s description now says the index is cached on disk after the first build.
- e2e runs with the cache off by default (`tests/e2e/setup.ts`), so P-6 keeps measuring a cold
  build and `npm run test:e2e` never touches the developer's `~/.cache`. The cache itself is
  exercised by the new `12-index-store` file through explicitly injected stores.
- New performance baseline P-12: `get_requirements` full scan, cold (previously unmeasured).

## [0.4.6] - 2026-08-13

### Changed

- **`instructions` now open with the running build's name and version.** The text is returned
  from `initialize` and lands in the client's system context before any tool is considered,
  which makes it the one place where a stale install can be noticed without spending a call.
  The line names the package and points at `npm view` for comparison.

  This server is installed through `npx -y @shuji-bonji/pdf-spec-mcp@latest`, and npx caches a
  resolved tree — so a client can run a build several releases behind while every document
  about it describes the newest one. The risk here is specific: 0.4.5 exists to stop this
  server being read as a conformance checker, and **a client on an older build gets none of
  that text** while the README says it does.

  pdf-verify-mcp did this in 0.15.0, pdf-writer-mcp in 0.19.0 and pdf-reader-mcp in 0.11.2;
  this release completes the family. A half-applied diagnostic is worse than none — a reader
  who sees no version line cannot tell "old build" from "build that never had the line".

  No tool, schema or behaviour changed.

### Build

- `scripts/sync-plugin-version.mjs` keeps `.claude-plugin/plugin.json` in step with
  `package.json`, wired to the `npm version` hook so the release commit — the tree the tag
  points at — carries the right plugin manifest, and to `prepublishOnly --check` as a
  backstop. Preventive: the drift has happened twice in pdf-verify-mcp and once in
  pdf-writer-mcp, never here, and in each case the fix landed in a commit *after* the tag,
  leaving the tagged tree wrong.

## [0.4.5] - 2026-07-25

### Documentation

- **Say plainly that this is a reference, not a rule engine ([#13](https://github.com/shuji-bonji/pdf-spec-mcp/issues/13)).**
  The server kept being read as a conformance checker. It is not: it retrieves and structures
  the *text* of ISO 32000 and never looks at a PDF file. Verdicts belong to pdf-verify-mcp.

  Both READMEs now open with that statement, followed by a table of what each of the four PDF
  family servers does **and does not** do — on the principle that the "does not" column is what
  prevents the misreading, so it goes first.

  The confusion is not academic. It collapses three distinct things: **declaration** (what a
  producer claims about itself), **conformance** (which nobody can prove), and **verification**
  (valid only within the rules a validator actually implements). A `shall` retrieved here tells
  you what the standard demands, never whether your file meets it.

  **The server now sends `instructions` on `initialize`** — the same statement, delivered where
  a client loads it into its system context before calling a single tool. That is the earliest
  point at which the misreading can be cut off, earlier than any README or tool description.
  (No other server in the family sets `instructions` yet; this one goes first.)

  Three tool descriptions were tightened for the same reason (behaviour unchanged):

  - `get_requirements` — states that it reads the standard, not your file
  - `search_spec` — no hits means "this corpus cannot answer", not "no such requirement";
    ISO 19005 (PDF/A) and ETSI PAdES are outside it
  - `list_specs` — points at `coverage.gaps` before you conclude a requirement does not exist

## [0.4.4] - 2026-07-19

### Fixed

- **SV-1 (#11): 親セクション指定で子孫の内容が見えなかった問題を修正 — 親はサブツリー全体を返す**。
  `get_section("12.8.2.2")` は前文（見出しのみ）しか返さず、子 12.8.2.2.2 の Table 257 に
  しか無い規範（P=1/2/3 の意味・**DSS/DocTimeStamp の増分更新は変更とみなさない**）が
  親経由の仕様確認から見えなかった。`get_tables("12.8.2.2")` も 0 表だった（SV-1b）。

  修正: 公開の `get_section` / `get_tables` は **outline の children リンクを DFS** して
  サブツリー全体（自身の前文 + 全子孫、文書順）を返す。連結する断片は S-9 で分割済みの
  own-content（互いに素）なので重複は生じない。requirements / search 索引は従来どおり
  own-content から構築（サブツリーを繋ぐと祖先の数だけ二重計上になる — 変異テストで
  6934 → 25068 に爆発することを確認済み）。`get_requirements` の親指定も prefix 文字列
  一致から children リンクへ移行し、Annex の子（キーがタイトル全体）に届くようになった。
  `pageRange` はサブツリーの実範囲（12.8.2.2 = 588–589）。
  最上位の節は応答が大きくなる（節 12 で約 500KB）ため、ツール説明に
  「なるべく具体的な節番号を」と明記した。

- **見出し判定の境界条件を修正**（SV-1 の根本の一つ）: `findSectionHeadingIndex` は
  「キー + 空白」の前方一致だったため、(a) 改行が続く Annex 見出し
  （`Annex A\n(informative)…`）と (b) 節番号を持たず**タイトル全体がキー**になる Annex 子
  セクション（`A.1 General`）で見出しを見つけられず、**51 セクションが親と先頭ページを
  二重保持**していた。境界（空白・改行・終端）一致に変更。`trimToSectionStart` /
  `extractOrphanedStrip` / `trimAfterNextSectionStart` / `extractPageSegments` の
  4 経路すべてが同じ関数を通るため一括で直る。
  要件インデックスは 7183 → **6934 件**（除去 319 件はすべて同一文の生存者あり =
  二重保持の解消、再帰属 70 件、新規テキスト 0、全数検証でコーパス全体の要素喪失ゼロ）。

## [0.4.3] - 2026-07-19

### Fixed

- **S-9 (#9): ページ跨ぎ合成の空行捏造と、断片の二重帰属を修正**。
  - **空行の捏造**: ページ跨ぎの Table 要素（Table 126 の最終断片は TH 内に pp.383–385 の
    Appearance 画像 19 個を抱えて 4 ページを跨ぐ）をページで輪切りにすると、テキストを持たない
    TR が `["","",""]` 行として合成されていた。**構造木に全セル空の TR は存在しない**
    （pdf-lib による StructTreeRoot ダンプ + pdf-reader-mcp の要素単位 walker の両方で確認）。
    `collectStructTreeTables` が全セル空行を採らないようにし、空だけの断片は表として出力しない。
    Table 126 は 27 → **21 行**（ISO の定義済みスポット関数 21 個と一致、reader M-8 の
    データ行合計 7+5+7+2 とも一致）、Table 54 は 5 → **3 行**（Miter/Round/Bevel）
  - **断片の二重帰属**: セクションがページを共有すると、前セクションの範囲がページ全体を覆う
    ため、次セクションの内容（キャプション付きの表を含む）も前セクションから見えていた。
    `get_tables("8.4.3.3")` が 8.4.3.4 の Table 54 を **Miter 1 行だけの不完全な重複**として
    正しいキャプション付きで返していた。`trimToSectionStart` の正確な裏返しとなる
    `trimAfterNextSectionStart` を導入（同じ `findSectionHeadingIndex`・同じ
    found/not-found の腕）し、共有ページをセクション境界で分割。
    get_section / get_requirements の二重計上も一括で解消され、要件インデックスは
    8666 → **7183 件**（除去 1483 件は**すべて同一文が他セクションに残る重複**であることを
    機械検証。喪失ゼロ・追加ゼロ）
- **S-10 (#10): `get_section` の `pageRange.end` が跨ぎ先ページを反映していなかった**。
  §14.9.4 は内容が p.816 まで返るのに `815–815` と報告され、ページ指定の後続処理
  （reader `read_text` / veraPDF の該当箇所確認）が 1 ページ手前で止まっていた。
  帯を採用したとき（= 次セクション見出しが跨ぎ先ページの途中で見つかったとき）に限り
  報告する end を +1 する。判定は帯の採用と同一なので規則は割れない。
  影響は帯を持つ **412 セクション**（全数差分で「すべて正確に end+1」を確認）。
  内部の endPage（抽出範囲・キャッシュキー）は不変。

## [0.4.2] - 2026-07-19

### Fixed

- **S-8: `search_spec` が「帯」の内容を次のセクションに誤帰属させていた問題を修正**。
  索引はページ単位で「そのページ以前に始まる最後のセクション」に丸ごと帰属していたため、
  ページ上端に残った前セクションの末尾（帯）は必ず次セクションのものとして索引されていた。
  実害: `search_spec("QuadPoints")` が 12.5.6.11 (Caret annotations) を返すが、QuadPoints は
  12.5.6.10 の Table 182 にあり、`get_tables("12.5.6.11")` には無い —
  **search で当たりを付けて section を引くと見つからない**というツール間の矛盾になっていた。

  修正: セクションが始まるページは `extractPageSegments` が **content-extractor と同じ
  `findSectionHeadingIndex`** で見出し位置を求めてセクション境界で分割し、見出しより上の帯は
  前から流れ込んでいるセクションに帰属させる（S-5 と同じ規則・同じ実装を共有。
  見出し未検出 → そのセクションがページ全体を保持・帯は採用しない、の腕も鏡映）。
  見出しが 1 つも見つからないページ（目次・正誤表・扉。タグ付けが `walkStructTree` の
  扱わないコンテナのため要素経由では文字が出ない）は従来どおり生テキストでページ全体を索引する。

  実測（ISO 32000-2 全 1023 ページ）: `search_spec("QuadPoints")` の先頭が 12.5.6.10@508 になり
  get_tables と繋がる。**同一ページで複数セクションが始まる場合に最後の 1 つ以外が検索から
  不可視だった 357 セクションが新たに検索可能**になった。索引から消えたセクションはゼロ。
  分割ページでは柱・ノンブル・購入者透かし（Artifact）が索引から外れる（全体で -5.9% の
  文字数はすべてこのノイズ）。索引構築は 3.1s → 4.9s（StructTree 走査の追加分）。

- **S-4: ヘッダで同定できない継続断片が連結されず、表が分裂していた問題を修正**。
  `collectStructTreeTables` の連結条件は「ヘッダ行の再掲が前の表と完全一致」のみだったため、
  ページ跨ぎの継続断片のうち (a) ヘッダが**全セル空文字**（画像のみの行が空で抽出される。
  Table 54 / Table 126）と (b) **ヘッダ自体が無い**もの（8.7.4.5.5 のエッジフラグ一覧）は
  連結されなかった。さらに空ヘッダ断片が挟まると連結の鎖が切れ、後続の正しいヘッダ再掲まで
  別の表になっていた（10.6.3 の Table 126 は 7 分裂）。

  新しい連結条件（S-4）: キャプションを持たず、**直前に取り込んだ `table` 要素に隣接**し、
  ヘッダが実質空（無い/全セル空白）で、**列数が前の表と一致**する断片を連結する。
  隣接を要求するので、段落を挟む別の表（8.7.4.5.5 の Mesh 2、8.7.4.5.6 の三角形定義）は
  連結されない。空ヘッダ行は行として追加しない（再掲ヘッダでも画像行でもテキストはゼロ）。

  全 987 セクションの全数差分で確認した影響: 変化したのは 4 セクションのみ
  （8.4.3.3 / 8.4.3.4: Table 54 が 3 → 1 表、8.7.4.5.5: 4 → 3 表、10.6.3: Table 126 が
  7 → 1 表・27 行）。**非空セルの喪失・追加はゼロ**、要件インデックスは 8666 件のまま文単位の
  増減ゼロ。副産物として Table 54 由来の要件 3 件に `table` コンテキストが付いた。

- **連結パスのキャッシュ混入の残り穴を修正**: 0.4.1 は push 時の行コピーを入れたが、
  継続行の連結は内側の行配列を**参照のまま** push していた。結果の連結行のセルを書き換えると
  セクション内容キャッシュに届いていた。連結時も行をコピーする
  （`table-collector.test.ts` に再発防止テストを追加）。

## [0.4.1] - 2026-07-18

> [!IMPORTANT]
> **0.4.0 は unpublish されている。** 下記の退行を抱えていたため、npm から取得できない。
> 0.4.0 の内容はすべて 0.4.1 に含まれる。`## [0.4.0]` の節は経緯の記録として残す。

### Fixed

- 🔴 **同じセクションを引くたびに表が膨らむ問題を修正**（0.4.0 で混入した退行）。
  `collectStructTreeTables` が返す `TableInfo` が、セクション内容キャッシュ（`ContentElement`）の
  `rows` 配列を**参照で共有**したまま、継続行の連結でその配列へ `push` していた。
  結果、**キャッシュされたページ自体が書き換わり**、次に引くと膨らんだ状態から再び連結された:
  - `get_tables("12.5.6.10")` の Table 182 が 1 回目 6 行 → 2 回目 7 行 → …と増え続ける
  - `get_tables` を挟むと `get_requirements("12.5.6.10")` が 6 件 → 15 件に増える

  全ツールは `readOnlyHint: true` / `idempotentHint: true` を宣言しているが、
  **実際には呼び出し順と回数で結果が変わっていた**。行と headers をコピーして返すよう修正。

  **正しい結果は変わっていない**: 0.4.0 と修正版で全 987 セクションの初回結果が完全に一致する。
  破壊だけを止めた。

  検知できなかった理由は、ユニットテストも e2e も**各ツールを 1 回ずつしか呼んでいなかった**こと。
  純粋関数のつもりのものがキャッシュされた入力を破壊していても気づけない。歯止めとして
  `table-collector.test.ts`（与えられた content を変更しない / 何度呼んでも同じ結果 /
  返した結果を汚してもキャッシュに届かない）と e2e の X-13〜X-15（全ツールの冪等性）を追加した。

## [0.4.0] - 2026-07-18 (unpublished)

> [!WARNING]
> **この版は npm から削除されている。** 表が呼び出しのたびに膨らむ退行があったため
> （0.4.1 を参照）。ここに書かれた変更はすべて 0.4.1 に含まれる。**0.4.1 以降を使うこと。**

抽出の正確性に関する大きな修正を含む。`get_section` / `get_requirements` / `get_tables` の
出力が広範に変わる（いずれも**取りこぼしていた内容の回復**であり、失われるものは無い）。

### Fixed

- **セクション境界の「帯」で内容が失われる問題を修正**（正典としての本丸）。
  セクションのページ範囲は outline から `[page, 次セクションの page - 1]` として決まるため、
  最終ページを越えて溢れた内容は「次セクションの先頭ページの、見出しより上」に取り残される。
  この帯は**どのセクションにも属していなかった** — 自分のページ範囲外であり、かつ
  `trimToSectionStart` が次セクションの内容から捨てるため、丸ごと消えていた。

  ISO 32000-2 の実測: **412 セクション**が内容を落としており（段落 2055・note 248・表 174・
  リスト 112）、うち **271 が要件文（shall 等）を含んでいた**。表では Table 182 の
  `QuadPoints` 行、Table 166 の `CA`/`BM`/`Lang`、Table 171 の注釈型（7 → 28 行）などが該当する。

  `getSectionContent` が帯を回収することで `get_section` / `get_requirements` / `get_tables` が
  一度に是正された。**行が増えた表 92 件・減った表 0 件、要件が増えたセクション 364・減少 0。**

  採用規則は `trimToSectionStart` の正確な裏返し（同じ `findSectionHeadingIndex` で判定）とし、
  二重計上を構造的に不可能にしている。次セクションの見出しが検出できない 69 セクションでは、
  次セクション側が帯を保持しているためあえて採用しない。

  既知の限界: ヘッダ行を持たない表は連結条件（`headers.length > 0`）を満たさないため、
  帯として採用されても分裂する（5 セクション。8.7.4.5.5 は 2 → 4 表）。内容は
  `get_section` から見える。

- **stdout ガードを追加**（[#8](https://github.com/shuji-bonji/pdf-spec-mcp/issues/8) 項目 1・family 規約 §2.4）。
  MCP は stdout で JSON-RPC を喋るため、依存ライブラリが stdout へ書くとストリームが壊れる。
  Node では **`console.log` と `console.info` が stdout**、`warn` / `error` は stderr。
  pdfjs-dist v5 の実際の経路は `warn()` → `console.warn`（stderr・**stdout は汚さない**）、
  `info()` → `console.info`（stdout）、`deprecated()` → `console.log`（stdout）であり、
  `src/utils/stdout-guard.ts` は log / info / warn を stderr へ転送する。
  ESM の import 巻き上げにより、`index.ts` の**最初の import** である必要がある。

### Added

- **`list_specs` が「答えられない領域」を宣言するようになった**（S-2）。
  `search_spec("PDF/A conformance")` は 0 件を返すが、これは**「要件が無い」ではなく
  「コーパスに無いので答えられない」**であり、区別する手段が無かった。family 規約 §2.0 は
  writer / verify の実装判断をこのサーバの原文照合に通すと定めているため、この偽陰性が
  そのまま設計判断に流れ込む。`list_specs` の応答に `coverage`（未収録領域・該当規格・
  その帰結）を含めた。エージェントが最初に叩くツールなので、探索を始める前に限界が分かる。
  対象: **PDF/A（ISO 19005-1〜-4）** と **PAdES（ETSI EN 319 142）**。
  なおこれらは「ファイルが未配置」ではなく `SPEC_PATTERNS` にパターン自体が無いため、
  PDF を置いても認識されない（塞ぐにはパターン追加が要る）。PDF/UA（ISO 14289）は
  コーパスにあるので verify の該当規則は照合できる
- **表の中の要件を抽出する**。`extractRequirementsFromContent` は paragraph / list / note
  しか走査しておらず、**表のセルを完全に無視していた**。ISO の表は要件語の宝庫であり
  （「(Required) The type of annotation ... shall be Highlight ...」）、実測で
  **2739 件・333 セクション分**が `get_requirements` から見えていなかった。
  全体インデックスは **5927 → 8666 件（+46%）**。本文由来の 5927 件は不変。

  表は `collectStructTreeTables` で再構成してから走査するため、キャプションの帰属は
  `get_tables` と一致し、ページを跨いで分割された表も 1 つの表として扱われる。
  text 由来の表（`detectTablesFromText`）は走査しない — あれは paragraph から組み立てられており、
  本文の走査が既に読んでいるため二重計上になる。

- `Requirement` に **`source` / `table` / `key`** を追加（既存フィールドは不変・非破壊）。
  表から切り出した文は単体では「どのキーの制約か」が失われるため
  （「... shall be Highlight, Underline, ...」だけでは Table 182 の `Subtype` の話だと分からない）。
  `text` は引用できるよう原文のままとし、文脈を別フィールドで持つ。
  実測では**重複 31 グループのうち 24 が「文が同一でキーが異なる別々の要件」**だった
  （Table 51 の「A PDF reader shall implicitly reset this parameter」は `soft mask` と
  `alpha constant` の両方に掛かる）。`key` が無ければ片方が失われていた。

### Changed

- **Biome 2.5.4 へ移行**（[#8](https://github.com/shuji-bonji/pdf-spec-mcp/issues/8) 項目 2）。ESLint + Prettier を廃止。
  family 標準に合わせ **2.5.4 完全固定**（キャレット禁止。整形結果が minor で変わるため）。
  CI / publish workflow に `npm run check` と `npm run typecheck` を組み込んだ
- `collectStructTreeTables` を `services/table-collector.ts` へ切り出し、`get_tables` と
  `get_requirements` が「表とは何か」の規則を共有するようにした
- `DocumentLoaderService` が `DocumentSource` を注入できるようになった（既定は従来どおり）。
  ファイル読みと pdfjs 起動を差し替えられるので、LRU キャッシュを単体で検証できる

### Removed

- **未使用の `src/container.ts` を削除**（[#8](https://github.com/shuji-bonji/pdf-spec-mcp/issues/8) 項目 3）。
  `createServices()` はどこからも呼ばれておらず、実運用は `pdf-service.ts` のシングルトン（YAGNI）

### Internal

- ドキュメント LRU キャッシュ（エビクション順・`doc.destroy()`・アクセス順の更新）に
  実質的なテストが存在しなかった。e2e の「LRU キャッシュ」テストは `get_structure` 経由で、
  上位の section-index メモ（spec ごと・上限なし）しか測っておらず、LRU が完全に壊れていても
  緑のままだった。`pdf-loader.test.ts` にユニットテストを追加し、e2e 側は実態に即して改名した
- `npm run check:imports` を追加（biome を使わず import 順を検査する）

## [0.3.2] - 2026-07-14

### Changed

- Version bump only. 0.3.1 の publish 済みバージョンとの整合性を取るためのリリースで、パッケージ内容に変更はない

## [0.3.1] - 2026-07-14

### Added

- **Claude Code plugin 対応**: `.claude-plugin/plugin.json` を追加。Claude Code のプラグインとしてインストールすると `pdf-spec` MCP server (`npx -y @shuji-bonji/pdf-spec-mcp@latest`) が登録される。ISO 仕様 PDF の場所は従来どおり `PDF_SPEC_DIR` で指定する

### Documentation

- README / README.ja に PDF family (pdf-spec-mcp / [pdf-reader-mcp](https://github.com/shuji-bonji/pdf-reader-mcp) / [pdf-verify-mcp](https://github.com/shuji-bonji/pdf-verify-mcp)) の役割分担表を追加

## [0.3.0] - 2026-07-12

### Added

- **PDF 2.0 Errata Collection 3 (EC3) support**: `ISO_32000-2_sponsored_EC3.pdf` is now the primary spec (`iso32000-2`). EC3 (June 1, 2026) is a complete replacement for EC2 — 356 errata corrections (766 edits), 20 appended errata pages (1,020 → 1,023 pages). Updated ISO/TS 32001 and 32002 EC3 filenames (`*_sponsored_EC3.pdf`) are matched by the existing TS patterns
- **EC2 fallback pattern**: environments with only `ISO_32000-2_sponsored-ec2.pdf` still register `iso32000-2` with the correct "Errata Collection 2" title

### Changed

- **Pattern-priority spec discovery**: `discoverSpecs()` now processes files in `SPEC_PATTERNS` order instead of `readdir` order. When multiple files map to the same spec ID (e.g. EC3 and EC2 side by side), the earlier pattern wins — previously the winner silently depended on alphabetical filename order

### Documentation

- **README / README.ja**: updated file listing to EC3 filenames

## [0.2.4] - 2026-05-09

### Build

- **build script に `chmod +x dist/index.js` を追加**: local dev で `./dist/index.js` を直接実行した際の `permission denied` を回避。npm install / npx 経由の通常利用には影響なし (npm が install 時に bin を chmod するため)。shuji 製 MCP 全体で build script を統一。

## [0.2.3] - 2026-04-18

### Changed

- **Release pipeline: npm Trusted Publisher (OIDC) adoption**
  - `.github/workflows/publish.yml` now authenticates via OIDC (`id-token: write`) instead of `NPM_TOKEN`
  - Published packages now include signed provenance (`npm publish --provenance --access public`)
  - `NPM_TOKEN` secret is no longer used by this workflow (can be removed from repository secrets after Trusted Publisher is configured on npmjs.com)
  - Added a version-consistency check: the job fails if `package.json` version does not match the pushed `v*` tag
  - Enabled npm cache (`cache: 'npm'`) on `setup-node`

### Documentation

- **README**: Clarified installation — users normally don't need `npm install`; the MCP client launches `npx -y @shuji-bonji/pdf-spec-mcp` directly. Added a global-install option for reference
- **README**: Added `src/types/` to the directory structure
- Same updates applied to `README.ja.md`

## [0.2.2] - 2026-02-08

### Improved

- **README overhaul**: Added Mermaid architecture diagram, detailed per-tool usage examples with `jsonc`, and layer overview table
- **PDF file setup guide**: Prominent `[!IMPORTANT]` / `[!WARNING]` callouts at top of README with download links
- **Full file listing**: Complete tree of all 17 supported PDF filenames with spec IDs and descriptions
- **`spec` parameter documentation**: Clarified that all tools accept `spec` parameter (replacing the previously planned `get_ts_section`)
- **Bilingual**: All improvements applied to both `README.md` (EN) and `README.ja.md` (JA)

## [0.2.1] - 2026-02-08

### Added

- **CI workflow**: GitHub Actions CI with Node.js 20/22 matrix (lint, format check, build, test)
- **Publish workflow**: Automated npm publish on `v*` tag push

## [0.2.0] - 2026-02-07

### Added

- **Multi-spec support**: Auto-discovery of up to 17 PDF specification documents from `PDF_SPEC_DIR`
- **8 MCP tools**: `list_specs`, `get_structure`, `get_section`, `search_spec`, `get_requirements`, `get_definitions`, `get_tables`, `compare_versions`
- **E2E test suite**: 212 tests across 11 files covering all tools with multi-spec matrix testing
- **Unit test suite**: 237 tests across 13 files
- **Class-based service architecture**: `RegistryService`, `DocumentLoaderService`, `PDFSpecService`, `CompareService` with dependency injection
- **Service container**: `createServices()` factory for DI wiring
- **Error hierarchy**: `PDFSpecError` base class with `ValidationError`, `RegistryError`, `ContentError`, `ToolPrerequisiteError`
- **Bounded-concurrency processing**: `mapConcurrent()` utility for parallel page/section processing
- **Text utilities**: `stripZeroWidthChars()`, `normalizeTitle()` for PDF text normalization
- **LRU document cache**: Up to 4 concurrent PDF documents cached with automatic eviction
- **Version comparison**: Title-based automatic section matching between PDF 1.7 and 2.0
- **Multi-page table detection**: Header merging for tables spanning multiple pages
- **Configurable constants**: `VALIDATION_LIMITS`, `CONCURRENCY` in `config.ts`

### Supported Specifications

- ISO 32000-2:2020 (PDF 2.0) with Errata Collection 2
- ISO 32000-2:2020 (PDF 2.0) original
- ISO 32000-1:2008 (PDF 1.7)
- Adobe PDF Reference 1.7
- ISO/TS 32001–32005 (Hash, Digital Signatures, AES-GCM, Integrity, Namespace)
- ISO 14289-1 (PDF/UA-1), ISO 14289-2 (PDF/UA-2)
- Tagged PDF Best Practice Guide, Well-Tagged PDF, PDF Declarations
- PDF 2.0 Application Notes 001–003

## [0.1.0] - 2026-02-06

### Added

- Initial implementation with single-spec support (ISO 32000-2)
- Basic section extraction, search, requirements, and definitions
- Unit tests

[0.3.2]: https://github.com/shuji-bonji/pdf-spec-mcp/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/shuji-bonji/pdf-spec-mcp/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/shuji-bonji/pdf-spec-mcp/compare/v0.2.3...v0.3.0
[0.2.3]: https://github.com/shuji-bonji/pdf-spec-mcp/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/shuji-bonji/pdf-spec-mcp/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/shuji-bonji/pdf-spec-mcp/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/shuji-bonji/pdf-spec-mcp/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/shuji-bonji/pdf-spec-mcp/releases/tag/v0.1.0
