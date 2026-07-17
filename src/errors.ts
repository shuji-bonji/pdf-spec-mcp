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
  /** Whether a different argument or a fixed environment could make this succeed. */
  retryable?: boolean;
}

/**
 * Base error class for all pdf-spec-mcp errors.
 */
export class PDFSpecError extends Error {
  readonly code: string;
  readonly hint?: string;
  readonly next_actions?: NextAction[];
  readonly retryable?: boolean;

  constructor(
    code: string,
    message: string,
    options: { hint?: string; next_actions?: NextAction[]; retryable?: boolean } = {},
  ) {
    super(message);
    this.name = 'PDFSpecError';
    this.code = code;
    this.hint = options.hint;
    this.next_actions = options.next_actions;
    this.retryable = options.retryable;
  }
}

type ErrorOptions = { hint?: string; next_actions?: NextAction[]; retryable?: boolean };

/**
 * Input validation errors (invalid parameters, out-of-range values, etc.)
 *
 * Always retryable: the caller controls the arguments.
 */
export class ValidationError extends PDFSpecError {
  constructor(message: string, options: ErrorOptions = {}) {
    super('VALIDATION_ERROR', message, { retryable: true, ...options });
    this.name = 'ValidationError';
  }
}

/**
 * Registry-related errors (spec not found, env var missing, discovery failure)
 */
export class RegistryError extends PDFSpecError {
  constructor(message: string, options: ErrorOptions = {}) {
    super('REGISTRY_ERROR', message, options);
    this.name = 'RegistryError';
  }
}

/**
 * Content extraction errors (section not found, page access failure, parse errors)
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
    super('PREREQUISITE_ERROR', message, { retryable: false, ...options });
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
    const out: SpecServiceError = { error: error.message, code: error.code };
    if (error.hint) out.hint = error.hint;
    if (error.next_actions && error.next_actions.length > 0) out.next_actions = error.next_actions;
    if (error.retryable !== undefined) out.retryable = error.retryable;
    return out;
  }
  if (error instanceof Error) {
    return { error: error.message, code: 'INTERNAL_ERROR' };
  }
  return { error: String(error), code: 'INTERNAL_ERROR' };
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
