import type { History } from "./blocks";

/**
 * Layer 3 — the one event union every layer yields. Names mirror OpenHarness
 * (`text.delta.text`, `tool.*.toolName`, `step.done` carries usage, `done.result`
 * enum). Divergences: `done.history` is the 3-block History (not a flat array),
 * plus `compaction.*` and `subagent` events for our distillation + spawn layers.
 */
export type AgentEvent =
  | { type: "text.delta"; text: string }
  | { type: "text.done" }
  | { type: "reasoning.delta"; text: string }
  | { type: "reasoning.done" }
  | { type: "tool.start"; toolName: string; toolCallId: string }
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
  | { type: "compaction.start"; reason: string; tokenCount: number }
  | { type: "compaction.done"; tokensBefore: number; tokensAfter: number }
  /** A child agent's event, bubbled up with its ancestry path. */
  | { type: "subagent"; path: string[]; event: AgentEvent }
  | { type: "error"; error: string }
  | {
      type: "done";
      result: "complete" | "stopped" | "max_steps" | "error";
      history: History;
      totalUsage: { totalTokens: number };
    };
