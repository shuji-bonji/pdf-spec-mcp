/**
 * PDF Spec MCP - Error Hierarchy
 *
 * Structured error classes for consistent error handling across the MCP server.
 * Each error carries a `code` string for programmatic error identification.
 */

/**
 * Base error class for all pdf-spec-mcp errors.
 */
export class PDFSpecError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'PDFSpecError';
    this.code = code;
  }
}

/**
 * Input validation errors (invalid parameters, out-of-range values, etc.)
 */
export class ValidationError extends PDFSpecError {
  constructor(message: string) {
    super('VALIDATION_ERROR', message);
    this.name = 'ValidationError';
  }
}

/**
 * Registry-related errors (spec not found, env var missing, discovery failure)
 */
export class RegistryError extends PDFSpecError {
  constructor(message: string) {
    super('REGISTRY_ERROR', message);
    this.name = 'RegistryError';
  }
}

/**
 * Content extraction errors (section not found, page access failure, parse errors)
 */
export class ContentError extends PDFSpecError {
  constructor(message: string) {
    super('CONTENT_ERROR', message);
    this.name = 'ContentError';
  }
}

/**
 * Tool prerequisite errors (required specs not available, missing dependencies)
 */
export class ToolPrerequisiteError extends PDFSpecError {
  constructor(message: string) {
    super('PREREQUISITE_ERROR', message);
    this.name = 'ToolPrerequisiteError';
  }
}
