/**
 * Structured tool errors for the MCP layer.
 *
 * MCP tools must never leak an internal stack trace or a raw Elasticsearch
 * error into a result. Instead every failure is converted to a small,
 * structured payload:
 *
 *     {
 *       isError: true,
 *       errorCategory: "validation" | "transient" | "business",
 *       isRetryable: boolean,
 *       message: "<safe, human-readable summary>",
 *       details: { ... }   // optional, safe context only
 *     }
 *
 * Tool logic throws one of the typed errors below for expected failures; the
 * `guard` wrapper wraps every tool handler so that *any* unexpected exception
 * is mapped to a generic, trace-free transient error.
 */

export type ErrorCategory = "validation" | "transient" | "business";

export const VALIDATION: ErrorCategory = "validation";
export const TRANSIENT: ErrorCategory = "transient";
export const BUSINESS: ErrorCategory = "business";

export type ToolErrorResult = {
  isError: true;
  errorCategory: ErrorCategory;
  isRetryable: boolean;
  message: string;
  details: Record<string, unknown>;
};

/** An expected, classified tool failure carrying a category and retryability. */
export class ToolError extends Error {
  readonly category: ErrorCategory;
  readonly retryable: boolean;
  readonly details: Record<string, unknown>;

  constructor(
    message: string,
    category: ErrorCategory,
    retryable: boolean,
    details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = "ToolError";
    this.category = category;
    this.retryable = retryable;
    this.details = details;
  }
}

/** Bad or unsupported input (unknown strategy, empty query). Not retryable. */
export class ToolValidationError extends ToolError {
  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message, VALIDATION, false, details);
    this.name = "ToolValidationError";
  }
}

/** A valid request that cannot be satisfied as asked. Not retryable. */
export class ToolBusinessError extends ToolError {
  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message, BUSINESS, false, details);
    this.name = "ToolBusinessError";
  }
}

/** A backend was momentarily unavailable. Safe to retry. */
export class ToolTransientError extends ToolError {
  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message, TRANSIENT, true, details);
    this.name = "ToolTransientError";
  }
}

/** Build the structured error payload returned in place of a result. */
export function errorResult(
  category: ErrorCategory,
  message: string,
  retryable: boolean,
  details: Record<string, unknown> = {}
): ToolErrorResult {
  return {
    isError: true,
    errorCategory: category,
    isRetryable: retryable,
    message,
    details
  };
}

/**
 * Heuristic: does this look like an Elasticsearch connection/timeout failure?
 * The `@elastic/elasticsearch` client throws `ConnectionError` and
 * `TimeoutError` (`error.name`) when the backend is unreachable; we treat those
 * as retryable transient errors without surfacing the raw error.
 */
function isElasticConnectivityError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) {
    return false;
  }
  const name = (err as { name?: unknown }).name;
  return (
    name === "ConnectionError" ||
    name === "TimeoutError" ||
    name === "NoLivingConnectionsError"
  );
}

/**
 * Wrap a tool handler so no failure ever escapes as a stack trace.
 *
 * - `ToolError` subclasses become their structured category payload.
 * - Elasticsearch connection/timeout errors become a retryable transient error.
 * - Anything else is mapped to a generic, non-retryable transient error with no
 *   internal detail. No stack trace is ever returned to the caller.
 */
export async function guard<T extends object>(
  name: string,
  fn: () => Promise<T>
): Promise<T | ToolErrorResult> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ToolError) {
      return errorResult(err.category, err.message, err.retryable, err.details);
    }
    if (isElasticConnectivityError(err)) {
      return errorResult(
        TRANSIENT,
        "The search backend is currently unreachable. Please retry shortly.",
        true,
        { tool: name, kind: (err as { name?: string }).name ?? "ConnectionError" }
      );
    }
    return errorResult(
      TRANSIENT,
      "An unexpected internal error occurred while handling the request.",
      false,
      { tool: name }
    );
  }
}
