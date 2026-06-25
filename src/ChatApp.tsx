import { useEffect, useRef, useState } from "react";
import { ArrowUp, Check, Loader, Plus, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * Chat island (client-only behavior). SSR renders the empty shell; `localStorage`,
 * `crypto.randomUUID`, and `fetch` are only touched in effects/handlers, never
 * during render, so the server pass is safe.
 *
 * Talks to `POST /api/agent/chat` with `fetch` and parses the SSE stream by hand
 * (the Eden treaty client can't consume `text/event-stream`). Each send appends one
 * user bubble + one agent turn; agent text accumulates and tool calls show inline.
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

const EXAMPLES = [
  "Summarize the agent/ architecture in 5 bullets",
  "List the files in src/api and what each does",
  "Read agent/runtime.ts and explain it",
];

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
  const abortRef = useRef<AbortController | null>(null);
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

  async function send(text?: string): Promise<void> {
    const prompt = (text ?? input).trim();
    if (!prompt || busy) return;
    setInput("");
    setBusy(true);
    setMessages((m) => [...m, { role: "user", text: prompt }, { role: "agent", text: "", tools: [] }]);

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sessionRef.current, prompt }),
        signal: ctrl.signal,
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
      if ((e as Error).name !== "AbortError") {
        updateAgent((m) => ({ ...m, text: `${m.text}\n\n⚠ ${(e as Error).message}` }));
      } else {
        updateAgent((m) => ({ ...m, text: m.text || "_(stopped)_" }));
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  }

  function stop(): void {
    abortRef.current?.abort();
  }

  async function reset(): Promise<void> {
    stop();
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

  const empty = messages.length === 0;

  return (
    // Sits below the persistent site topbar (~3.5rem); fills the rest of the viewport.
    <div className="fixed inset-x-0 bottom-0 top-14 z-10 flex flex-col bg-background">
      {/* Chat sub-bar: context label + new-chat action (site nav lives in the topbar). */}
      <header className="flex h-11 shrink-0 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="size-2 rounded-full bg-primary" />
          <span>Agent · this repo</span>
        </div>
        <Button variant="ghost" size="sm" onClick={() => void reset()}>
          <Plus className="size-4" /> New chat
        </Button>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {empty ? (
          <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center gap-6 px-4">
            <div className="text-center">
              <h1 className="text-2xl font-semibold">How can I help?</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                I can read, search, edit, and run code in this repo.
              </p>
            </div>
            <div className="flex w-full flex-col gap-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => void send(ex)}
                  className="rounded-xl border bg-card px-4 py-3 text-left text-sm text-card-foreground transition-colors hover:bg-accent"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
            {messages.map((m, i) => (
              <Message key={i} m={m} streaming={busy && i === messages.length - 1} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="shrink-0 px-4 pb-4">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-end gap-2 rounded-2xl border bg-card p-2 shadow-sm focus-within:ring-1 focus-within:ring-ring">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Message the agent…"
              rows={1}
              className="max-h-48 min-h-0 resize-none border-0 bg-transparent px-2 py-1.5 shadow-none focus-visible:ring-0"
            />
            {busy ? (
              <Button size="icon" variant="secondary" className="rounded-full" onClick={stop} aria-label="Stop">
                <Square className="size-4" />
              </Button>
            ) : (
              <Button
                size="icon"
                className="rounded-full"
                onClick={() => void send()}
                disabled={!input.trim()}
                aria-label="Send"
              >
                <ArrowUp className="size-4" />
              </Button>
            )}
          </div>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Enter to send · Shift+Enter for newline
          </p>
        </div>
      </div>
    </div>
  );
}

function Message({ m, streaming }: { m: Msg; streaming: boolean }) {
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl bg-primary px-4 py-2.5 text-sm text-primary-foreground">
          {m.text}
        </div>
      </div>
    );
  }

  const waiting = streaming && !m.text && !(m.tools && m.tools.length > 0);

  return (
    <div className="flex gap-3">
      <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
        A
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        {m.tools && m.tools.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {m.tools.map((t) => (
              <span
                key={t.id}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-xs",
                  t.state === "err"
                    ? "border-destructive/40 text-destructive"
                    : "text-muted-foreground",
                )}
                title={t.error}
              >
                {t.state === "run" ? (
                  <Loader className="size-3 animate-spin" />
                ) : t.state === "ok" ? (
                  <Check className="size-3 text-primary" />
                ) : (
                  <X className="size-3" />
                )}
                {t.name}
              </span>
            ))}
          </div>
        )}

        {waiting ? (
          <div className="flex gap-1 py-2">
            <span className="size-2 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:-0.3s]" />
            <span className="size-2 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:-0.15s]" />
            <span className="size-2 animate-bounce rounded-full bg-muted-foreground/50" />
          </div>
        ) : (
          m.text && (
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{m.text}</div>
          )
        )}

        {m.usage && (
          <div className="text-[10px] text-muted-foreground">
            in {m.usage.inputTokens} · out {m.usage.outputTokens} · {m.usage.totalTokens} tok
          </div>
        )}
      </div>
    </div>
  );
}
