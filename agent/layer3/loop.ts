import type {
  ChatCompletionAssistantMessageParam,
  ChatCompletionCreateParamsNonStreaming,
} from "openai/resources/chat/completions";
import { MODEL, openaiClient } from "../layer1/client";
import { dispatchToolCall, type ApproveFn } from "../layer2/dispatch";
import { toOpenAITools, type ToolContext, type ToolRegistry } from "../layer2/tool";
import { assemble, type History } from "./blocks";
import type { AgentEvent } from "./events";

export interface RunConfig {
  registry: ToolRegistry;
  /** MANDATORY termination cap (no default — every loop is bounded). */
  maxSteps: number;
  temperature?: number;
  maxTokens?: number;
  approve?: ApproveFn;
  signal?: AbortSignal;
}

/**
 * Layer 3 — the STATELESS agent loop (non-streaming). Holds no state across calls:
 * the caller threads a `History` in and gets the updated `History` back on the
 * `done` event. Multi-turn = `run(done.history, nextInput, cfg)`.
 *
 * Non-streaming: each step is one `chat.completions.create({stream:false})` whose
 * full reply (text + tool_calls + usage) arrives at once, so the loop is a plain
 * async generator — no event queue, no fragment reassembly. Tools run sequentially;
 * the loop yields lifecycle events directly around each `dispatchToolCall`.
 */
export async function* run(
  history: History,
  input: string,
  cfg: RunConfig,
): AsyncGenerator<AgentEvent> {
  const h = history;
  h.task.messages.push({ role: "user", content: input });

  let step = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  const totalUsage = () => ({ inputTokens, outputTokens, totalTokens });

  try {
    while (true) {
      if (cfg.signal?.aborted) {
        yield { type: "done", result: "stopped", history: h, totalUsage: totalUsage() };
        return;
      }

      yield { type: "step.start", step };

      const params: ChatCompletionCreateParamsNonStreaming = {
        model: MODEL,
        messages: assemble(h, ""), // input already folded into task above
        stream: false,
      };
      const tools = toOpenAITools(cfg.registry);
      if (tools.length > 0) {
        params.tools = tools;
        params.tool_choice = "auto";
      }
      if (cfg.temperature !== undefined) params.temperature = cfg.temperature;
      if (cfg.maxTokens !== undefined) params.max_tokens = cfg.maxTokens;

      const resp = await openaiClient.chat.completions.create(params, { signal: cfg.signal });
      const choice = resp.choices[0];
      const respMsg = choice?.message;
      const usage = {
        promptTokens: resp.usage?.prompt_tokens ?? 0,
        completionTokens: resp.usage?.completion_tokens ?? 0,
        totalTokens: resp.usage?.total_tokens ?? 0,
      };
      inputTokens += usage.promptTokens;
      outputTokens += usage.completionTokens;
      totalTokens += usage.totalTokens;

      const assistantMsg: ChatCompletionAssistantMessageParam = {
        role: "assistant",
        content: respMsg?.content ?? null,
      };
      const toolCalls = respMsg?.tool_calls;
      if (toolCalls && toolCalls.length > 0) assistantMsg.tool_calls = toolCalls;
      h.task.messages.push(assistantMsg);

      if (respMsg?.content) yield { type: "text", text: respMsg.content };
      yield {
        type: "step.done",
        step,
        finishReason: choice?.finish_reason ?? null,
        lastInputTokens: usage.promptTokens,
        lastOutputTokens: usage.completionTokens,
      };

      if (toolCalls && toolCalls.length > 0) {
        const ctx: ToolContext = { signal: cfg.signal };
        for (const call of toolCalls) {
          const toolName = call.type === "function" ? call.function.name : "(unknown)";
          const args = call.type === "function" ? call.function.arguments : undefined;
          yield { type: "tool.start", toolName, toolCallId: call.id, args };

          const r = await dispatchToolCall(call, { registry: cfg.registry, ctx, approve: cfg.approve });
          h.task.messages.push(r.message);

          if (r.ok) {
            yield { type: "tool.done", toolName, toolCallId: call.id };
          } else {
            yield { type: "tool.error", toolName, toolCallId: call.id, error: r.error ?? "unknown" };
          }
        }

        step += 1;
        if (step >= cfg.maxSteps) {
          yield { type: "done", result: "max_steps", history: h, totalUsage: totalUsage() };
          return;
        }
        continue; // model reacts to the tool results
      }

      // No tool calls → the model is finished.
      yield { type: "done", result: "complete", history: h, totalUsage: totalUsage() };
      return;
    }
  } catch (e) {
    yield { type: "error", error: e instanceof Error ? e.message : String(e) };
    yield { type: "done", result: "error", history: h, totalUsage: totalUsage() };
  }
}
