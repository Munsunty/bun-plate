import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

/**
 * Layer 3 — the 3-block history. This is the divergence from a flat message array:
 * history is three semantic blocks, and a SEPARATE `assemble()` flattens them into
 * the message array the SDK wants. Compaction (L4) moves content task → experience
 * while keeping all three blocks intact.
 */

/** Stable, set once. Identity = who the agent is. */
export interface IdentityBlock {
  systemPrompt: string;
  /** Optional loaded AGENTS.md / CLAUDE.md text appended to the system prompt. */
  instructionsFiles?: string;
}

/** Distilled long-term memory. L4 compaction appends here. */
export interface ExperienceBlock {
  summaries: string[];
}

/** Live working set — grows during a run, trimmed by compaction. */
export interface TaskBlock {
  messages: ChatCompletionMessageParam[];
}

export interface History {
  identity: IdentityBlock;
  experience: ExperienceBlock;
  task: TaskBlock;
}

export function emptyHistory(identity: IdentityBlock): History {
  return { identity, experience: { summaries: [] }, task: { messages: [] } };
}

/**
 * THE assembler. 3 blocks + current input → the flat `ChatCompletionMessageParam[]`
 * for `chat.completions.create`. The flat array exists only transiently here; the
 * threaded/persisted unit is always `History`.
 *
 * Order: identity system → experience system (if any) → live task messages → input.
 * Pass `input: ""` when the input has already been folded into `task.messages`.
 */
export function assemble(h: History, input: string): ChatCompletionMessageParam[] {
  const msgs: ChatCompletionMessageParam[] = [];

  const identityText = h.identity.instructionsFiles
    ? `${h.identity.systemPrompt}\n\n${h.identity.instructionsFiles}`
    : h.identity.systemPrompt;
  msgs.push({ role: "system", content: identityText });

  if (h.experience.summaries.length > 0) {
    msgs.push({
      role: "system",
      content: `Prior distilled context (older work, summarized):\n\n${h.experience.summaries.join(
        "\n\n---\n\n",
      )}`,
    });
  }

  msgs.push(...h.task.messages);

  if (input) msgs.push({ role: "user", content: input });

  return msgs;
}
