import type { ChatCompletionCreateParamsStreaming } from "openai/resources/chat/completions";
import { MODEL, openaiClient } from "../layer1/client";
import { dispatchToolCalls, type ApproveFn } from "../layer2/dispatch";
import { toOpenAITools, type ToolContext, type ToolRegistry } from "../layer2/tool";
import {
  distill,
  estimateHistoryTokens,
  shouldCompact,
  type CompactionConfig,
} from "../layer4/compaction";
import type { ControlContext } from "../layer5/control";
import { assemble, type History } from "./blocks";
import type { AgentEvent } from "./events";
import { accumulateStream } from "./stream";

export interface RunConfig {
  registry: ToolRegistry;
  /** MANDATORY termination cap (no default — every loop is bounded). */
  maxSteps: number;
  temperature?: number;
  maxTokens?: number;
  approve?: ApproveFn;
  /** L5 limits threaded down to tools (the `task` spawn tool reads this). */
  control: ControlContext;
  /** L4 — omit to disable compaction. */
  compaction?: CompactionConfig;
  signal?: AbortSignal;
}

/**
 * Decouples `emit` (called from nested async — stream, dispatch, subagents) from the
 * generator's `yield`. The driver pushes events here; `run` drains them in order.
 */
class EventQueue {
  private items: AgentEvent[] = [];
  private resolvers: Array<(r: IteratorResult<AgentEvent>) => void> = [];
  private closed = false;

  push(e: AgentEvent): void {
    const r = this.resolvers.shift();
    if (r) r({ value: e, done: false });
    else this.items.push(e);
  }

  close(): void {
    this.closed = true;
    let r: ((r: IteratorResult<AgentEvent>) => void) | undefined;
    while ((r = this.resolvers.shift())) r({ value: undefined as never, done: true });
  }

  async *drain(): AsyncGenerator<AgentEvent> {
    while (true) {
      const item = this.items.shift();
      if (item !== undefined) {
        yield item;
        continue;
      }
      if (this.closed) return;
      const result = await new Promise<IteratorResult<AgentEvent>>((res) =>
        this.resolvers.push(res),
      );
      if (result.done) return;
      yield result.value;
    }
  }
}

/**
 * Layer 3 — the STATELESS agent loop. Holds no state across calls: the caller
 * threads a `History` in and gets the updated `History` back on the `done` event.
 * Multi-turn = `run(done.history, nextInput, cfg)`.
 */
export async function* run(
  history: History,
  input: string,
  cfg: RunConfig,
): AsyncGenerator<AgentEvent> {
  const queue = new EventQueue();
  const emit = (e: AgentEvent) => queue.push(e);

  const driver = (async () => {
    try {
      await drive(history, input, cfg, emit);
    } catch (e) {
      emit({ type: "error", error: e instanceof Error ? e.message : String(e) });
      emit({ type: "done", result: "error", history, totalUsage: { totalTokens: 0 } });
    } finally {
      queue.close();
    }
  })();

  for await (const ev of queue.drain()) yield ev;
  await driver; // surface any driver rejection that escaped the catch
}

async function drive(
  history: History,
  input: string,
  cfg: RunConfig,
  emit: (e: AgentEvent) => void,
): Promise<void> {
  let h = history;
  h.task.messages.push({ role: "user", content: input });

  let step = 0;
  let totalTokens = 0;
  let lastInputTokens = 0;

  while (true) {
    if (cfg.signal?.aborted) {
      emit({ type: "done", result: "stopped", history: h, totalUsage: { totalTokens } });
      return;
    }

    // L4 — compaction check between LLM calls (never mid-stream).
    if (cfg.compaction && shouldCompact(h, lastInputTokens, cfg.compaction)) {
      emit({ type: "compaction.start", reason: "token_threshold", tokenCount: lastInputTokens });
      const before = lastInputTokens;
      h = await distill(h, cfg.compaction, emit);
      emit({
        type: "compaction.done",
        tokensBefore: before,
        tokensAfter: estimateHistoryTokens(h, cfg.compaction),
      });
    }

    emit({ type: "step.start", step });

    const params: ChatCompletionCreateParamsStreaming = {
      model: MODEL,
      messages: assemble(h, ""), // input already folded into task above
      stream: true,
      stream_options: { include_usage: true },
    };
    const tools = toOpenAITools(cfg.registry);
    if (tools.length > 0) {
      params.tools = tools;
      params.tool_choice = "auto";
    }
    if (cfg.temperature !== undefined) params.temperature = cfg.temperature;
    if (cfg.maxTokens !== undefined) params.max_tokens = cfg.maxTokens;

    const stream = await openaiClient.chat.completions.create(params, { signal: cfg.signal });
    const { message, finishReason, usage } = await accumulateStream(stream, emit);
    emit({ type: "text.done" });

    lastInputTokens = usage.promptTokens;
    totalTokens += usage.totalTokens;
    h.task.messages.push(message);
    emit({
      type: "step.done",
      step,
      finishReason,
      lastInputTokens,
      lastOutputTokens: usage.completionTokens,
    });

    const toolCalls = message.tool_calls;
    if (toolCalls && toolCalls.length > 0) {
      const ctx: ToolContext = { signal: cfg.signal, control: cfg.control, emit };
      const toolMsgs = await dispatchToolCalls(toolCalls, {
        registry: cfg.registry,
        ctx,
        approve: cfg.approve,
        emit,
      });
      h.task.messages.push(...toolMsgs);

      step += 1;
      if (step >= cfg.maxSteps) {
        emit({ type: "done", result: "max_steps", history: h, totalUsage: { totalTokens } });
        return;
      }
      continue; // model reacts to the tool results
    }

    // No tool calls → the model is finished.
    emit({ type: "done", result: "complete", history: h, totalUsage: { totalTokens } });
    return;
  }
}
