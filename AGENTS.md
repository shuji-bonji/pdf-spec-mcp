# AGENTS.md

このリポジトリ（pdf-spec-mcp）で作業するエージェントと人が、最初に読む規則です。開発の手引きは [CLAUDE.md](./CLAUDE.md)、PDF family 全体の計画は pdf-agent-stack の `docs/specs/31-openspec-spec-ids-adoption-plan.md` にあります。

## 仕様の正本

- 意図の正本は `openspec/specs/` です（[OpenSpec](https://github.com/Fission-AI/OpenSpec) の置き場）。Wiki・Discussions・README・`docs/NEXT-SESSION.md` は正本にしません。
- 変更は `openspec/changes/<slug>/` に出し（`openspec new change <slug>`）、人が承認するまで実装を始めません。`<slug>` に日付を入れません（`openspec archive` が `YYYY-MM-DD-` を付けます）。
- 実装する係は `openspec/specs/` の本文を直接書き換えません。正本へ取り込むのは `openspec archive` です。実装から仕様へ戻したい発見は、新しい `openspec/changes/` に書きます。
- `openspec/specs/` にまだ無いツールは、その変更が触るときに初版を起こします（8 ツールを一斉には起こしません）。初版の下書きは pdf-agent-stack の `scripts/openspec-skeleton.mjs` で `tools/list` から出せます（引数の表だけ。振る舞いの要求は既存のテストから起こします）。

## 仕様 ID

- 形式は `SPEC-PDFSPEC-<機能>-<3 桁>` です（例: `SPEC-PDFSPEC-GET-REQUIREMENTS-001`）。機能は `openspec/specs/<capability>/spec.md` のディレクトリ名を大文字にしたものです（capability はツール名の `_` を `-` にした kebab-case）。番号は機能ごとに 001 からの通し番号です。
- 要求の見出しは `### Requirement: SPEC-PDFSPEC-<機能>-<3 桁> 題` の形で書きます。各要求に `#### Scenario:` を 1 つ以上書き、Scenario 名をテスト名の後半にします。
- 新しい ID は `npx spec-ids next <capability>` で取ります（複数なら `--count 3`）。一度使った番号はその機能の中で再利用しません。
- 仕様を外すときは差分の `## REMOVED Requirements` に書き、テストからも ID を外します。

## テストの置き場

- `src/**/*.test.ts`（単体テスト）は CI で回ります。`tests/e2e/**/*.test.ts` は仕様 PDF（`PDF_SPEC_DIR`）が要るので、仕様 PDF のある手元でしか回りません。
- `spec-ids check` は両方のテスト名を読みます。CI で確かめたい要求の受入テストは `src/` 側に置きます。

## 承認の記録

- `openspec/changes/<slug>/proposal.md` の先頭の front matter に `approved: YYYY-MM-DD`（JST）と `pr: N` を人が書きます。エージェントは空のキー（`approved:`・`pr:`）のまま出します。`implementation`（`required` / `none`）と `targets`（書き換える capability の配列）はエージェントが書きます。
- `openspec/specs/<capability>/spec.md` の front matter には `spec_id: PDFSPEC`・`kind`（`tool` / `common`）・`introduced_by`（その capability を作った変更の slug）を書きます。
- 🔴 新しい capability を作る変更では、`openspec archive` が差分の front matter を正本に写しません（OpenSpec 1.14.1）。archive の後、正本の先頭に front matter を書き足してから `npx spec-ids check` を回します。

## PR の種類

| ブランチ | 種類 | 入れてよいもの |
| --- | --- | --- |
| `spec/<slug>` | 仕様 PR | `openspec/changes/<slug>/` の proposal.md と差分の `specs/<capability>/spec.md` |
| `spec-init/<capability>` | 初版起こし | `openspec/specs/<capability>/spec.md` と、既存テスト名への仕様 ID の追加 |
| それ以外（`feat/` `fix/` `docs/` `chore/`） | 実装 PR | `src/`・テスト・版・CHANGELOG、`openspec archive` による取り込み（`openspec/changes/<slug>/` → `openspec/changes/archive/YYYY-MM-DD-<slug>/` と `openspec/specs/` の更新） |

- 1 つの変更を 1 本の PR（提案 → 仕様 → 実装 → archive）で進めてよいです（PDF family の計画 §6.3）。その場合もブランチは実装 PR の名前にします。
- 🔴 実装 PR は `openspec/changes/<slug>/` の追加を `pr-scope` が通しません。人が proposal.md に `approved` と `pr` を書いたら、**マージの前に** `openspec archive` の commit を足します。
- CI の `spec-gate` は `npx openspec validate --all` → `npx spec-ids check` の順に走り、PR のときだけ `npx spec-ids pr-scope` が変えてよいパスを検査します。
- 署名・push・PR・マージ・タグは人が行います。

## 記録

- 変更ごとに `openspec/changes/<slug>/record.md` を残します（版・かかった時間・人が判断した箇所・仕様と実装のずれ・読み返した回数。書式は計画 §8）。archive でそのまま `archive/` に移ります。
