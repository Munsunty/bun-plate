import type {
  ChatCompletionAssistantMessageParam,
  ChatCompletionChunk,
  ChatCompletionMessageToolCall,
} from "openai/resources/chat/completions";
import type { AgentEvent } from "./events";

export interface StreamResult {
  message: ChatCompletionAssistantMessageParam;
  finishReason: string | null;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
}

interface ToolCallAccumulator {
  id: string;
  name: string;
  arguments: string;
}

/**
 * Consume an openai streaming response: emit `text.delta`/`reasoning.delta`,
 * reassemble the assistant message, and accumulate fragmented `tool_calls` by index
 * (concatenating `function.arguments` string fragments). Requires
 * `stream_options:{ include_usage:true }` so usage arrives in the final chunk.
 */
export async function accumulateStream(
  stream: AsyncIterable<ChatCompletionChunk>,
  emit: (e: AgentEvent) => void,
): Promise<StreamResult> {
  let content = "";
  const toolCalls: ToolCallAccumulator[] = [];
  let finishReason: string | null = null;
  let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

  for await (const chunk of stream) {
    const choice = chunk.choices[0];
    if (choice) {
      const delta = choice.delta;

      if (delta?.content) {
        content += delta.content;
        emit({ type: "text.delta", text: delta.content });
      }

      // Non-standard reasoning fields some OpenAI-compatible routers emit.
      const reasoning =
        (delta as { reasoning?: string; reasoning_content?: string } | undefined)?.reasoning ??
        (delta as { reasoning_content?: string } | undefined)?.reasoning_content;
      if (reasoning) emit({ type: "reasoning.delta", text: reasoning });

      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          let slot = toolCalls[tc.index];
          if (!slot) {
            slot = { id: "", name: "", arguments: "" };
            toolCalls[tc.index] = slot;
          }
          if (tc.id) slot.id = tc.id;
          if (tc.function?.name) slot.name = tc.function.name;
          if (tc.function?.arguments) slot.arguments += tc.function.arguments;
        }
      }

      if (choice.finish_reason) finishReason = choice.finish_reason;
    }

    if (chunk.usage) {
      usage = {
        promptTokens: chunk.usage.prompt_tokens,
        completionTokens: chunk.usage.completion_tokens,
        totalTokens: chunk.usage.total_tokens,
      };
    }
  }

  const message: ChatCompletionAssistantMessageParam = {
    role: "assistant",
    content: content || null,
  };

  const built: ChatCompletionMessageToolCall[] = toolCalls
    .filter((t): t is ToolCallAccumulator => Boolean(t) && t.id !== "")
    .map((t) => ({
      id: t.id,
      type: "function",
      function: { name: t.name, arguments: t.arguments },
    }));
  if (built.length > 0) message.tool_calls = built;

  return { message, finishReason, usage };
}
