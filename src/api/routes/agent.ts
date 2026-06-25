import { Elysia, t } from "elysia";
import { createAgentRuntime, emptyHistory, run, type History } from "../../../agent/index";

/**
 * Agent sidecar routes. The agent's `run()` loop is driven here and its events are
 * streamed to the browser as Server-Sent Events (SSE) so tool progress shows live.
 *
 * SSE is a raw `Response` (not an Eden-typed handler): the Eden treaty client can't
 * consume an event stream, so `ChatApp` reads `/api/agent/chat` with `fetch`
 * directly. The body is still validated by Elysia (`t.Object`).
 *
 * Sessions are an in-memory `Map` (history threaded across turns). They are NOT
 * persisted — a server restart clears them. Swap for a `*.repo.ts`-backed store to
 * survive restarts.
 */

const { registry, systemPrompt } = createAgentRuntime();
const sessions = new Map<string, History>();

const encoder = new TextEncoder();
const sse = (data: unknown): Uint8Array => encoder.encode(`data: ${JSON.stringify(data)}\n\n`);

export const agentRoutes = new Elysia({ prefix: "/agent" })
  .post(
    "/chat",
    ({ body }) => {
      const { sessionId, prompt } = body;
      const history = sessions.get(sessionId) ?? emptyHistory({ systemPrompt });

      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          try {
            for await (const ev of run(history, prompt, { registry, maxSteps: 50 })) {
              if (ev.type === "done") {
                // Persist the threaded history for this session, but don't ship the
                // (heavy) full message log to the client — only the summary fields.
                sessions.set(sessionId, ev.history);
                controller.enqueue(
                  sse({ type: "done", result: ev.result, totalUsage: ev.totalUsage }),
                );
              } else {
                controller.enqueue(sse(ev));
              }
            }
          } catch (e) {
            controller.enqueue(sse({ type: "error", error: e instanceof Error ? e.message : String(e) }));
          } finally {
            controller.enqueue(sse({ type: "end" }));
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    },
    { body: t.Object({ sessionId: t.String({ minLength: 1 }), prompt: t.String({ minLength: 1 }) }) },
  )
  .post(
    "/reset",
    ({ body }) => {
      sessions.delete(body.sessionId);
      return { ok: true };
    },
    { body: t.Object({ sessionId: t.String({ minLength: 1 }) }) },
  );
