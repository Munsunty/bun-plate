import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

const DISTILL_SYSTEM = `You are a context distiller for a long-running agent.
Compress the task history below into a terse, durable summary that lets the agent
continue without the raw transcript.

KEEP: decisions made and their rationale; file paths created/edited/read; the
current sub-goal and any open threads or next steps; unresolved errors and their
causes; key facts discovered.

DISCARD: raw tool output (file dumps, command stdout), restated instructions, and
conversational filler — they are already reflected in the decisions above.

Write in compact bullet points. Be specific (names, paths, values). Do not invent.`;

function renderMessage(m: ChatCompletionMessageParam): string {
  const role = m.role;
  if (role === "tool") {
    const body = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
    return `[tool result] ${body.slice(0, 1000)}`;
  }
  if (role === "assistant") {
    const text = typeof m.content === "string" ? m.content : "";
    const calls = m.tool_calls
      ?.map((c) => (c.type === "function" ? `→ ${c.function.name}(${c.function.arguments})` : "→ (custom tool)"))
      .join(" ");
    return `[assistant] ${text}${calls ? ` ${calls}` : ""}`.trim();
  }
  const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
  return `[${role}] ${content}`;
}

/**
 * Build the summarizer prompt: system instruction + prior summaries (for continuity)
 * + the old transcript slice. The model's reply becomes one new experience summary.
 */
export function buildDistillMessages(
  oldSlice: ChatCompletionMessageParam[],
  priorSummaries: string[],
): ChatCompletionMessageParam[] {
  const prior = priorSummaries.length
    ? `Summaries of even older work (for continuity, do not repeat verbatim):\n${priorSummaries.join(
        "\n---\n",
      )}\n\n`
    : "";
  const transcript = oldSlice.map(renderMessage).join("\n");
  return [
    { role: "system", content: DISTILL_SYSTEM },
    { role: "user", content: `${prior}Distill this task history:\n\n${transcript}` },
  ];
}
