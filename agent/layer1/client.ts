import OpenAI from "openai";

/**
 * Layer 1 — the only place that touches LLM env and constructs an OpenAI client.
 *
 * The router contract (see CLAUDE.md / project vision): a single OpenAI-compatible
 * client pointed at a custom `base_url`. Everything above imports `openaiClient` +
 * `MODEL`; nothing else builds an OpenAI instance. No `@openai/agents`, no AI SDK.
 */

const apiKey = process.env.OPENAI_API_KEY;

/** OpenAI-compatible router endpoint (LM Studio, vLLM, an in-house gateway, …). */
export const baseURL = process.env.OPENAI_BASE_URL;

/** Resolved model id. Routers that ignore the field still accept the default. */
export const MODEL =
  process.env.OPENAI_MODEL?.trim() ||
  process.env.OPENAI_DEFAULT_MODEL?.trim() ||
  "wrapper";

if (!apiKey) {
  throw new Error("OPENAI_API_KEY is required.");
}

export const openaiClient = new OpenAI({
  apiKey,
  ...(baseURL ? { baseURL } : {}),
});
