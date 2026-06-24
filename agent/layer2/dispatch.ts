import type {
  ChatCompletionMessageToolCall,
  ChatCompletionToolMessageParam,
} from "openai/resources/chat/completions";
import type { z } from "zod";
import type { AgentEvent } from "../layer3/events";
import { withSlot } from "../layer5/control";
import type { ToolContext, ToolRegistry } from "./tool";

/** L5 gate chokepoint. Default-allow when unset. */
export type ApproveFn = (info: {
  toolName: string;
  toolCallId: string;
  input: unknown;
}) => boolean | Promise<boolean>;

export interface DispatchDeps {
  registry: ToolRegistry;
  ctx: ToolContext;
  approve?: ApproveFn;
  emit: (e: AgentEvent) => void;
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

/**
 * One assistant tool_call → exactly one tool result message. Validation failures,
 * denials, and thrown errors are all rendered as tool results (never thrown to the
 * loop) so the model can self-correct on the next step.
 */
export async function dispatchToolCall(
  call: ChatCompletionMessageToolCall,
  deps: DispatchDeps,
): Promise<ChatCompletionToolMessageParam> {
  const { registry, ctx, approve, emit } = deps;
  const toolCallId = call.id;

  // Custom (non-function) tool calls are unsupported by this runtime.
  if (call.type !== "function") {
    const error = `Unsupported tool call type: ${call.type}`;
    emit({ type: "tool.error", toolName: "(unknown)", toolCallId, error });
    return toolMessage(toolCallId, { error });
  }

  const toolName = call.function.name;
  emit({ type: "tool.start", toolName, toolCallId });

  const def = registry[toolName];
  if (!def) {
    const error = `Unknown tool: ${toolName}. Available: ${Object.keys(registry).join(", ")}`;
    emit({ type: "tool.error", toolName, toolCallId, error });
    return toolMessage(toolCallId, { error });
  }

  // Parse the JSON-string arguments the model produced.
  let raw: unknown;
  try {
    raw = call.function.arguments ? JSON.parse(call.function.arguments) : {};
  } catch (e) {
    const error = `Arguments are not valid JSON: ${(e as Error).message}`;
    emit({ type: "tool.error", toolName, toolCallId, error });
    return toolMessage(toolCallId, { error });
  }

  // Runtime validation against the SSOT schema → feed failures back to the model.
  const parsed = def.parameters.safeParse(raw);
  if (!parsed.success) {
    const error = `Invalid arguments: ${formatZodError(parsed.error)}`;
    emit({ type: "tool.error", toolName, toolCallId, error });
    return toolMessage(toolCallId, { error });
  }

  // L5 approval gate.
  if (approve) {
    const allowed = await approve({ toolName, toolCallId, input: parsed.data });
    if (!allowed) {
      const error = `Denied by policy: ${toolName}`;
      emit({ type: "tool.error", toolName, toolCallId, error });
      return toolMessage(toolCallId, { error });
    }
  }

  // Execute through the concurrency limiter. Orchestration tools (spawn) are
  // exempt: they mostly wait on child work, and holding a slot while the child's
  // own tools need slots would deadlock. Concurrency bounds real leaf work only.
  try {
    const result = def.concurrencyExempt
      ? await def.execute(parsed.data, ctx)
      : await withSlot(ctx.control, () => def.execute(parsed.data, ctx));
    emit({ type: "tool.done", toolName, toolCallId });
    return toolMessage(toolCallId, result);
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    emit({ type: "tool.error", toolName, toolCallId, error });
    return toolMessage(toolCallId, { error });
  }
}

/**
 * Fan out over `message.tool_calls`. Order is preserved (matching tool_call_ids);
 * actual parallelism is bounded by the limiter's concurrency cap inside each call.
 */
export async function dispatchToolCalls(
  calls: ChatCompletionMessageToolCall[],
  deps: DispatchDeps,
): Promise<ChatCompletionToolMessageParam[]> {
  return Promise.all(calls.map((c) => dispatchToolCall(c, deps)));
}
