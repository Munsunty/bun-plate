import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * Chat island (client-only behavior). SSR renders the empty shell; `localStorage`,
 * `crypto.randomUUID`, and `fetch` are only touched in effects/handlers, never
 * during render, so the server pass is safe.
 *
 * Talks to `POST /api/agent/chat` with `fetch` and parses the SSE stream by hand
 * (the Eden treaty client can't consume `text/event-stream`). Each send appends one
 * user bubble + one agent bubble; agent text accumulates and tool calls show inline.
 */

interface ToolEntry {
  id: string;
  name: string;
  state: "run" | "ok" | "err";
  error?: string;
}

interface Usage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

interface Msg {
  role: "user" | "agent";
  text: string;
  tools?: ToolEntry[];
  usage?: Usage;
}

const SESSION_KEY = "agent-session";

function loadSessionId(): string {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export function ChatApp() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const sessionRef = useRef<string>("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    sessionRef.current = loadSessionId();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /** Mutate the trailing agent bubble (the one currently streaming). */
  function updateAgent(fn: (m: Msg) => Msg): void {
    setMessages((prev) => {
      if (prev.length === 0) return prev;
      const copy = prev.slice();
      copy[copy.length - 1] = fn(copy[copy.length - 1]!);
      return copy;
    });
  }

  function handleEvent(ev: any): void {
    switch (ev.type) {
      case "text":
        updateAgent((m) => ({ ...m, text: m.text + ev.text }));
        break;
      case "tool.start":
        updateAgent((m) => ({
          ...m,
          tools: [...(m.tools ?? []), { id: ev.toolCallId, name: ev.toolName, state: "run" }],
        }));
        break;
      case "tool.done":
        updateAgent((m) => ({
          ...m,
          tools: m.tools?.map((t) => (t.id === ev.toolCallId ? { ...t, state: "ok" } : t)),
        }));
        break;
      case "tool.error":
        updateAgent((m) => ({
          ...m,
          tools: m.tools?.map((t) =>
            t.id === ev.toolCallId ? { ...t, state: "err", error: ev.error } : t,
          ),
        }));
        break;
      case "done":
        updateAgent((m) => ({ ...m, usage: ev.totalUsage }));
        break;
      case "error":
        updateAgent((m) => ({ ...m, text: `${m.text}\n\n⚠ ${ev.error}` }));
        break;
      default:
        break; // step.start / step.done / end
    }
  }

  async function send(): Promise<void> {
    const prompt = input.trim();
    if (!prompt || busy) return;
    setInput("");
    setBusy(true);
    setMessages((m) => [...m, { role: "user", text: prompt }, { role: "agent", text: "", tools: [] }]);

    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sessionRef.current, prompt }),
      });
      if (!res.ok || !res.body) throw new Error(`request failed: ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.replace(/^data: /, "").trim();
          if (line) handleEvent(JSON.parse(line));
        }
      }
    } catch (e) {
      updateAgent((m) => ({ ...m, text: `${m.text}\n\n⚠ ${(e as Error).message}` }));
    } finally {
      setBusy(false);
    }
  }

  async function reset(): Promise<void> {
    await fetch("/api/agent/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: sessionRef.current }),
    }).catch(() => {});
    setMessages([]);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-2rem)] max-w-3xl flex-col gap-3 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Agent Chat</h1>
        <Button variant="ghost" size="sm" onClick={() => void reset()} disabled={busy}>
          New session
        </Button>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto rounded-lg border bg-muted/20 p-4">
        {messages.length === 0 && (
          <p className="mt-8 text-center text-sm text-muted-foreground">
            Ask the agent to read, search, edit, or run code in this repo.
          </p>
        )}

        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={
                m.role === "user"
                  ? "max-w-[80%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground whitespace-pre-wrap"
                  : "max-w-[85%] space-y-2"
              }
            >
              {m.role === "agent" && m.tools && m.tools.length > 0 && (
                <div className="space-y-0.5 text-xs text-muted-foreground">
                  {m.tools.map((t) => (
                    <div key={t.id} className="flex items-center gap-1.5 font-mono">
                      <span>
                        {t.state === "run" ? "⋯" : t.state === "ok" ? "✓" : "✗"} {t.name}
                      </span>
                      {t.error && <span className="text-destructive">{t.error}</span>}
                    </div>
                  ))}
                </div>
              )}
              {m.text && (
                <div
                  className={
                    m.role === "agent"
                      ? "rounded-lg bg-card px-3 py-2 text-sm whitespace-pre-wrap"
                      : ""
                  }
                >
                  {m.text}
                </div>
              )}
              {m.role === "agent" && m.usage && (
                <div className="text-[10px] text-muted-foreground">
                  in {m.usage.inputTokens} · out {m.usage.outputTokens} · {m.usage.totalTokens} tok
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="flex items-end gap-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Message the agent…  (Enter to send, Shift+Enter for newline)"
          rows={2}
          className="resize-none"
          disabled={busy}
        />
        <Button onClick={() => void send()} disabled={busy || !input.trim()}>
          {busy ? "…" : "Send"}
        </Button>
      </div>
    </div>
  );
}
