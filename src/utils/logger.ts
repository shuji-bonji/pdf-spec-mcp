/**
 * Logger Utility
 * All output goes to stderr (stdout is reserved for MCP protocol)
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface Logger {
  debug(context: string, message: string): void;
  info(context: string, message: string): void;
  warn(context: string, message: string): void;
  error(context: string, message: string, error?: Error): void;
}

function formatMessage(context: string, message: string): string {
  return `[${context}] ${message}`;
}

export const logger: Logger = {
  debug(context: string, message: string): void {
    if (process.env.DEBUG) {
      console.error(formatMessage(context, message));
    }
  },

  info(context: string, message: string): void {
    console.error(formatMessage(context, message));
  },

  warn(context: string, message: string): void {
    console.error(formatMessage(context, message));
  },

  error(context: string, message: string, error?: Error): void {
    console.error(formatMessage(context, message));
    if (error && process.env.DEBUG) {
      console.error(error.stack);
    }
  },
};
