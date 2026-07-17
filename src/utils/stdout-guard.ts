/**
 * stdout guard (side-effect only).
 *
 * MCP は stdout で JSON-RPC を喋るため、依存ライブラリからの `console.log` /
 * `console.warn` の漏れがストリームを壊す。本リポジトリは pdfjs-dist に依存し、
 * pdfjs の `warn()` は console.log（= stdout）を使うため、ガードが無いと
 * 実際に JSON-RPC が壊れる（reader で実証済みの事故）。
 * 本モジュールは両者を stderr へリダイレクトする。
 *
 * エントリポイントの**最初の import** であること。ESM は import をトップレベル
 * 文より先に巻き上げるため、index.ts にインラインで書くと依存モジュールの
 * 評価後に実行されてしまう。独立モジュールに隔離し最初に import することで、
 * 他のモジュールがロードされる前にガードが入ることを保証する。
 */

console.log = (...args: unknown[]) => console.error('[log]', ...args);
console.warn = (...args: unknown[]) => console.error('[warn]', ...args);
