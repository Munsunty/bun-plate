import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { MODEL, openaiClient } from "../layer1/client";
import { assemble, type History } from "../layer3/blocks";
import type { AgentEvent } from "../layer3/events";
import { buildDistillMessages } from "./distill-prompt";

/**
 * Layer 4 — compaction as EXPERIENCE DISTILLATION. When accumulated task results
 * inflate context past `triggerTokens`, the OLD slice of `task.messages` is folded
 * into a new `experience.summaries` entry; the recent `protectedTokens` slice is
 * kept verbatim. Crucially the result is still a 3-block History (identity +
 * experience + task) — we distill INTO a block, we don't replace the history.
 */

export interface CompactionConfig {
  /** Compact once an LLM call's prompt tokens reach this (e.g. 75% of the window). */
  triggerTokens: number;
  /** Most-recent task tokens kept verbatim, never folded. */
  protectedTokens: number;
  /** Cheaper model id for the summary pass, if the router exposes one. */
  summaryModel?: string;
  estimateTokens: (msgs: ChatCompletionMessageParam[]) => number;
}

/** Cheap, dependency-free token estimate (~4 chars/token over role+content). */
export function defaultEstimateTokens(msgs: ChatCompletionMessageParam[]): number {
  let chars = 0;
  for (const m of msgs) {
    chars += m.role.length + 4;
    if (typeof m.content === "string") chars += m.content.length;
    else if (m.content) chars += JSON.stringify(m.content).length;
    if (m.role === "assistant" && m.tool_calls) chars += JSON.stringify(m.tool_calls).length;
  }
  return Math.ceil(chars / 4);
}

/** Trigger checked between LLM calls; `lastInputTokens` = openai `usage.prompt_tokens`. */
export function shouldCompact(
  _h: History,
  lastInputTokens: number,
  cfg: CompactionConfig,
): boolean {
  return lastInputTokens >= cfg.triggerTokens;
}

/**
 * Fold the old slice of task messages into a fresh experience summary. Identity is
 * never touched; experience grows by one; task keeps only the recent slice.
 */
export async function distill(
  h: History,
  cfg: CompactionConfig,
  _emit: (e: AgentEvent) => void,
): Promise<History> {
  const msgs = h.task.messages;

  // Walk from the end accumulating tokens until we've protected `protectedTokens`.
  let acc = 0;
  let cut = msgs.length;
  for (let i = msgs.length - 1; i >= 0; i--) {
    acc += cfg.estimateTokens([msgs[i]!]);
    cut = i;
    if (acc >= cfg.protectedTokens) break;
  }

  // Guard: `recent` must not begin with a tool message whose assistant tool_calls
  // would land in `old` (that produces a dangling tool_call_id and a 400). Advance
  // the cut past any leading tool messages so they fold into `old` with their call.
  while (cut < msgs.length && msgs[cut]?.role === "tool") cut++;

  const old = msgs.slice(0, cut);
  const recent = msgs.slice(cut);
  if (old.length === 0) return h; // nothing old enough to fold

  const distillMsgs = buildDistillMessages(old, h.experience.summaries);
  const resp = await openaiClient.chat.completions.create({
    model: cfg.summaryModel ?? MODEL,
    messages: distillMsgs,
    stream: false,
  });
  const summary = resp.choices[0]?.message?.content ?? "(distillation produced no summary)";

  return {
    identity: h.identity, // UNCHANGED
    experience: { summaries: [...h.experience.summaries, summary] }, // GREW by 1
    task: { messages: recent }, // OLD slice discarded (now summarized)
  };
}

/** Estimate the assembled prompt size of a History (used for compaction.done). */
export function estimateHistoryTokens(h: History, cfg: CompactionConfig): number {
  return cfg.estimateTokens(assemble(h, ""));
}
