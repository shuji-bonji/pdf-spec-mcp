/**
 * stdout guard (side-effect only).
 *
 * MCP は stdout で JSON-RPC を喋るため、依存ライブラリが stdout へ書くと
 * ストリームが壊れる。Node では **`console.log` と `console.info` が stdout**、
 * `console.warn` / `console.error` は stderr に出る。
 *
 * 本リポジトリが依存する pdfjs-dist (v5) の実際の経路を確認した結果:
 * - `warn()` → `console.warn` … **stderr。stdout は汚さない**
 * - `info()` → `console.info` … **stdout**（既定 verbosity では出ないが、上がれば漏れる）
 * - `deprecated()` → `console.log` … **stdout**（非推奨 API を踏むと無条件に出る）
 *
 * したがってガードすべき本命は `console.info` と `console.log` であり、
 * `console.warn` の転送は保険（将来 pdfjs 側の実装が変わる / 他の依存が使う場合）。
 * family の writer / verify は log と warn のみを塞いでおり info が素通りなので、
 * こちらへ合わせるべき（別途 issue 化のこと）。
 *
 * エントリポイントの**最初の import** であること。ESM は import をトップレベル
 * 文より先に巻き上げるため、index.ts にインラインで書くと依存モジュールの
 * 評価後に実行されてしまう。独立モジュールに隔離し最初に import することで、
 * 他のモジュールがロードされる前にガードが入ることを保証する。
 */

console.log = (...args: unknown[]) => console.error('[log]', ...args);
console.info = (...args: unknown[]) => console.error('[info]', ...args);
console.warn = (...args: unknown[]) => console.error('[warn]', ...args);
