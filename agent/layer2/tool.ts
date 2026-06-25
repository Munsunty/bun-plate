import { z } from "zod";
import type { ChatCompletionFunctionTool } from "openai/resources/chat/completions";

/**
 * Layer 2 — the SSOT (single source of truth). One Zod schema per tool yields all
 * three faces:
 *   (a) the openai `tools` param JSON   → `toOpenAITool` via z.toJSONSchema
 *   (b) the execute fn's argument TYPES  → z.infer inside `defineTool`
 *   (c) runtime argument validation      → schema.safeParse in the dispatcher
 */

/** Threaded into every tool's execute. */
export interface ToolContext {
  signal?: AbortSignal;
}

/**
 * Erased tool shape stored in the registry. `execute` takes `any` so heterogeneous
 * tools (each with a different inferred arg type) are assignable to one registry
 * type under strictFunctionTypes. Authoring stays type-safe via `defineTool`.
 */
export interface ToolDef {
  name: string;
  description: string;
  parameters: z.ZodType;
  execute: (args: any, ctx: ToolContext) => Promise<unknown>;
}

export type ToolRegistry = Record<string, ToolDef>;

/**
 * Define a tool from its Zod schema (SSOT). Inside `execute`, `args` is fully typed
 * as `z.infer<S>`. The returned value is the erased `ToolDef` for the registry.
 */
export function defineTool<S extends z.ZodType, R>(def: {
  name: string;
  description: string;
  parameters: S;
  execute: (args: z.infer<S>, ctx: ToolContext) => Promise<R>;
}): ToolDef {
  return def as ToolDef;
}

/** SSOT → openai SDK tool. `z.toJSONSchema` fills `function.parameters`. */
export function toOpenAITool(def: ToolDef): ChatCompletionFunctionTool {
  // Drop the root `$schema` key: it's valid JSON Schema but some OpenAI-compatible
  // routers reject unknown keys in `function.parameters`.
  const { $schema, ...parameters } = z.toJSONSchema(def.parameters, {
    target: "draft-2020-12",
    unrepresentable: "any",
  }) as Record<string, unknown>;
  void $schema;
  return {
    type: "function",
    function: {
      name: def.name,
      description: def.description,
      parameters,
    },
  };
}

export function toOpenAITools(reg: ToolRegistry): ChatCompletionFunctionTool[] {
  return Object.values(reg).map(toOpenAITool);
}
