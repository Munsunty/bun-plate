import type { History } from "./blocks";

/**
 * Layer 3 — the event union the loop yields. Non-streaming: the model's full reply
 * arrives in one chunk, so assistant text is a single `text` event (no deltas) and
 * there are no reasoning fragments. Tool lifecycle + step + done remain.
 */
export type AgentEvent =
  | { type: "text"; text: string }
  | { type: "tool.start"; toolName: string; toolCallId: string; args: unknown }
  | { type: "tool.done"; toolName: string; toolCallId: string }
  | { type: "tool.error"; toolName: string; toolCallId: string; error: string }
  | { type: "step.start"; step: number }
  | {
      type: "step.done";
      step: number;
      finishReason: string | null;
      lastInputTokens: number;
      lastOutputTokens: number;
    }
  | { type: "error"; error: string }
  | {
      type: "done";
      result: "complete" | "stopped" | "max_steps" | "error";
      history: History;
      totalUsage: { inputTokens: number; outputTokens: number; totalTokens: number };
    };
