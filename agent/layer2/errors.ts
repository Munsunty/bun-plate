import type { z } from "zod";

/**
 * Sentinel errors. The dispatcher renders these as `role:"tool"` error results
 * (errors-as-tool-results) so the loop never crashes — the model sees the failure
 * and self-corrects on the next step.
 */

export class ToolArgValidationError extends Error {
  constructor(
    public readonly toolName: string,
    public readonly issues: z.ZodError,
  ) {
    super(`Argument validation failed for "${toolName}".`);
    this.name = "ToolArgValidationError";
  }
}

export class ToolDeniedError extends Error {
  constructor(
    public readonly toolName: string,
    public readonly reason: string,
  ) {
    super(`Tool "${toolName}" denied: ${reason}`);
    this.name = "ToolDeniedError";
  }
}

export class ToolExecutionError extends Error {
  constructor(
    public readonly toolName: string,
    public readonly detail: unknown,
  ) {
    super(`Tool "${toolName}" threw: ${detail instanceof Error ? detail.message : String(detail)}`);
    this.name = "ToolExecutionError";
  }
}
