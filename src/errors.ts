/**
 * PDF Spec MCP - Error Hierarchy
 *
 * Structured error classes for consistent error handling across the MCP server.
 * Each error carries a `code` string for programmatic error identification.
 */

/** A concrete step an agent can take to get past an error. */
export interface NextAction {
  action: string;
  reason: string;
}

/**
 * The family error contract (規約 §2.3).
 *
 * `code` alone tells an agent *what* went wrong; `hint` and `next_actions` tell it what to
 * do about it, and `retryable` whether doing so is worth trying. Orchestration Skills read
 * these to decide their next move instead of surfacing a dead end to the user.
 *
 * @see https://github.com/shuji-bonji/houki-research-skill/blob/main/docs/ERROR-CODES.md
 */
export interface SpecServiceError {
  error: string;
  code: string;
  /** What the caller should understand about the failure. */
  hint?: string;
  /** Concrete next steps. */
  next_actions?: NextAction[];
  /**
   * Whether a different argument could make this succeed. Always present
   * (SPEC-PDFSPEC-COMMON-ERRORS-003): without it a caller cannot decide whether to retry.
   */
  retryable: boolean;
  /** Server-specific detail. */
  detail?: ErrorDetail;
}

/**
 * Server-specific detail of an error (規約 §2.3). No error of this server writes one at
 * the moment: the only field, `legacyCode` (the 0.11.x name `VALIDATION_ERROR`), was a
 * transition aid for 0.12.x and was removed in 0.13.0.
 */
export type ErrorDetail = Record<string, unknown>;

/**
 * `retryable` per `code` — one value each, never chosen where the error is raised
 * (SPEC-PDFSPEC-COMMON-ERRORS-003). Until 0.13.x, REGISTRY_ERROR and CONTENT_ERROR took the
 * value at the call site, so a caller could not decide by `code` alone; reader, writer and
 * verify already fixed it per code. The rule is the same: could a different argument make
 * the same call succeed?
 */
export const RETRYABLE: Readonly<Record<string, boolean>> = {
  INVALID_ARGUMENT: true,
  REGISTRY_ERROR: false,
  CONTENT_ERROR: false,
  PREREQUISITE_ERROR: false,
  INTERNAL_ERROR: false,
};

/**
 * Base error class for all pdf-spec-mcp errors.
 */
export class PDFSpecError extends Error {
  readonly code: string;
  readonly hint?: string;
  readonly next_actions?: NextAction[];
  readonly retryable: boolean;
  readonly detail?: ErrorDetail;

  constructor(code: string, message: string, options: ErrorOptions = {}) {
    super(message);
    this.name = 'PDFSpecError';
    this.code = code;
    this.hint = options.hint;
    this.next_actions = options.next_actions;
    // Looked up from the code; an options.retryable passed by a caller is not used.
    this.retryable = RETRYABLE[code] ?? false;
    this.detail = options.detail;
  }
}

type ErrorOptions = {
  hint?: string;
  next_actions?: NextAction[];
  detail?: ErrorDetail;
};

/**
 * Input validation errors (invalid parameters, out-of-range values, etc.)
 *
 * Reported as the family's common code `INVALID_ARGUMENT` (SPEC-PDFSPEC-COMMON-ERRORS-002).
 * Always retryable: the caller controls the arguments.
 */
export class ValidationError extends PDFSpecError {
  constructor(message: string, options: ErrorOptions = {}) {
    super('INVALID_ARGUMENT', message, options);
    this.name = 'ValidationError';
  }
}

/**
 * Registry errors: the environment (PDF_SPEC_DIR) has to change before a call can succeed.
 * Never retryable. An unknown spec id is an argument error (ValidationError) since 0.14.0.
 */
export class RegistryError extends PDFSpecError {
  constructor(message: string, options: ErrorOptions = {}) {
    super('REGISTRY_ERROR', message, options);
    this.name = 'RegistryError';
  }
}

/**
 * Content errors: a specification PDF that cannot be read as needed. Never retryable.
 * A section, table or term the arguments point at but that does not exist is an argument
 * error (ValidationError) since 0.14.0. No call site raises this at the moment.
 */
export class ContentError extends PDFSpecError {
  constructor(message: string, options: ErrorOptions = {}) {
    super('CONTENT_ERROR', message, options);
    this.name = 'ContentError';
  }
}

/**
 * Tool prerequisite errors (required specs not available, missing dependencies)
 *
 * Not retryable as-is: the environment has to change first. `next_actions` carries what
 * that change is, so an orchestrating Skill can tell the user precisely what to install
 * rather than reporting a bare failure.
 */
export class ToolPrerequisiteError extends PDFSpecError {
  constructor(message: string, options: ErrorOptions = {}) {
    super('PREREQUISITE_ERROR', message, options);
    this.name = 'ToolPrerequisiteError';
  }
}

/**
 * Shape an error for the MCP response (規約 §2.3).
 *
 * Optional members are omitted rather than set to undefined, so the JSON stays clean for
 * whatever reads it.
 */
export function toStructuredError(error: unknown): SpecServiceError {
  if (error instanceof PDFSpecError) {
    const out: SpecServiceError = {
      error: error.message,
      code: error.code,
      retryable: error.retryable,
    };
    if (error.hint) out.hint = error.hint;
    if (error.next_actions && error.next_actions.length > 0) out.next_actions = error.next_actions;
    if (error.detail) out.detail = error.detail;
    return out;
  }
  if (error instanceof Error) {
    return { error: error.message, code: 'INTERNAL_ERROR', retryable: false };
  }
  return { error: String(error), code: 'INTERNAL_ERROR', retryable: false };
}

/**
 * Presets for the recurring dead ends.
 *
 * This server is useless without its corpus — the spec PDFs are copyrighted and cannot be
 * shipped, so "the file is not there" is the normal first-run failure rather than an
 * exceptional one. Saying exactly which file, and where to get it, is what turns that into
 * something an agent can resolve.
 */
export const NEXT_ACTIONS = {
  setSpecDir: (envVar: string): NextAction => ({
    action: `set_${envVar}`,
    reason:
      `Set the ${envVar} environment variable to the directory holding the specification PDFs, ` +
      'then restart the MCP server. The PDFs are copyrighted and are not distributed with this package.',
  }),
  /**
   * The value reached us as the literal text `${VAR}` — the host that spawned the server
   * did not expand the reference written in the plugin's `env`. Nothing on the server side
   * can recover the intended path; the fix is in the host's own configuration file.
   */
  expandEnvInHostConfig: (envVar: string, literal: string): NextAction => ({
    action: 'set_absolute_path_in_host_config',
    reason:
      `${envVar} was received as the unexpanded text "${literal}". The host that started this ` +
      "server does not expand the plugin's env references. Write the absolute path " +
      "into the host's own configuration instead (Claude Code: settings.json or ~/.claude.json; " +
      'Grok Build: ~/.grok/config.toml [mcp_servers.pdf-spec]; Claude Desktop: ' +
      'claude_desktop_config.json). See https://shuji-bonji.github.io/pdf-agent-stack/reference/env-vars',
  }),
  downloadSpec: (file: string, url: string): NextAction => ({
    action: 'download_spec_pdf',
    reason: `Place "${file}" in PDF_SPEC_DIR. Download it from ${url}`,
  }),
  listSpecs: (): NextAction => ({
    action: 'call_list_specs',
    reason: 'Call list_specs to see which specification PDFs are currently available.',
  }),
  getStructure: (): NextAction => ({
    action: 'call_get_structure',
    reason: 'Call get_structure to see the available section numbers for this spec.',
  }),
} as const;
