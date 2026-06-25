import type {
  ChatCompletionMessageToolCall,
  ChatCompletionToolMessageParam,
} from "openai/resources/chat/completions";
import type { z } from "zod";
import type { ToolContext, ToolRegistry } from "./tool";

/** Approval gate chokepoint. Default-allow when unset. */
export type ApproveFn = (info: {
  toolName: string;
  toolCallId: string;
  input: unknown;
}) => boolean | Promise<boolean>;

export interface DispatchDeps {
  registry: ToolRegistry;
  ctx: ToolContext;
  approve?: ApproveFn;
}

/**
 * Outcome of one tool call. `message` is always the `role:"tool"` result to push
 * into history; `ok`/`error` let the loop decide whether to emit tool.done or
 * tool.error. Validation failures, denials, and thrown errors are all rendered as
 * tool results (never thrown to the loop) so the model can self-correct next step.
 */
export interface DispatchResult {
  message: ChatCompletionToolMessageParam;
  ok: boolean;
  error?: string;
}

function formatZodError(err: z.ZodError): string {
  return err.issues
    .map((i) => `${i.path.length ? i.path.join(".") : "(root)"}: ${i.message}`)
    .join("; ");
}

/** Render any tool outcome to the string `content` a `role:"tool"` message needs. */
function toolMessage(
  toolCallId: string,
  payload: unknown,
): ChatCompletionToolMessageParam {
  return {
    role: "tool",
    tool_call_id: toolCallId,
    content: typeof payload === "string" ? payload : JSON.stringify(payload),
  };
}

function fail(toolCallId: string, error: string): DispatchResult {
  return { message: toolMessage(toolCallId, { error }), ok: false, error };
}

/**
 * One assistant tool_call → exactly one tool result message. Pure: no events, no
 * concurrency slot. The caller (loop) emits lifecycle events around this.
 */
export async function dispatchToolCall(
  call: ChatCompletionMessageToolCall,
  deps: DispatchDeps,
): Promise<DispatchResult> {
  const { registry, ctx, approve } = deps;
  const toolCallId = call.id;

  // Custom (non-function) tool calls are unsupported by this runtime.
  if (call.type !== "function") {
    return fail(toolCallId, `Unsupported tool call type: ${call.type}`);
  }

  const toolName = call.function.name;
  const def = registry[toolName];
  if (!def) {
    return fail(
      toolCallId,
      `Unknown tool: ${toolName}. Available: ${Object.keys(registry).join(", ")}`,
    );
  }

  // Parse the JSON-string arguments the model produced.
  let raw: unknown;
  try {
    raw = call.function.arguments ? JSON.parse(call.function.arguments) : {};
  } catch (e) {
    return fail(toolCallId, `Arguments are not valid JSON: ${(e as Error).message}`);
  }

  // Runtime validation against the SSOT schema → feed failures back to the model.
  const parsed = def.parameters.safeParse(raw);
  if (!parsed.success) {
    return fail(toolCallId, `Invalid arguments: ${formatZodError(parsed.error)}`);
  }

  // Approval gate.
  if (approve) {
    const allowed = await approve({ toolName, toolCallId, input: parsed.data });
    if (!allowed) return fail(toolCallId, `Denied by policy: ${toolName}`);
  }

  try {
    const result = await def.execute(parsed.data, ctx);
    return { message: toolMessage(toolCallId, result), ok: true };
  } catch (e) {
    return fail(toolCallId, e instanceof Error ? e.message : String(e));
  }
}
