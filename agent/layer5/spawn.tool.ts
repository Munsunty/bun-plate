import { z } from "zod";
import { emptyHistory, type History } from "../layer3/blocks";
import { run } from "../layer3/loop";
import { defineTool, type ToolDef } from "../layer2/tool";
import type { SubagentCatalog } from "./catalog";
import { forkChild } from "./control";

/** Pull the final assistant text out of a finished child history. */
function lastAssistantText(h: History): string {
  for (let i = h.task.messages.length - 1; i >= 0; i--) {
    const m = h.task.messages[i];
    if (m && m.role === "assistant" && typeof m.content === "string" && m.content) {
      return m.content;
    }
  }
  return "";
}

/**
 * Layer 5 — spawn IS a tool. `task` is dispatched through the SAME L2 dispatcher as
 * any tool, so it inherits the `approve` gate, and `forkChild` enforces the depth +
 * spawn-budget limits. Refusals come back as a structured error → rendered as a tool
 * error so the parent model adapts.
 *
 * Concurrency: `task` is marked `concurrencyExempt`, so it holds NO slot while the
 * child runs. The parent spawn mostly *waits* on the child; the child's own leaf
 * tools (fs/bash/…) each acquire a slot via `withSlot`. Only real leaf work counts
 * against `maxConcurrent`, so no chain or fan-out of spawns can deadlock — a waiting
 * orchestrator never blocks a worker that needs a slot.
 */
export function createSpawnTool(catalog: SubagentCatalog, names: string[]): { task: ToolDef } {
  if (names.length === 0) {
    throw new Error("createSpawnTool: at least one subagent name is required.");
  }
  const agentEnum = z.enum(names as [string, ...string[]]);

  const task = defineTool({
    name: "task",
    description:
      "Delegate a focused sub-task to a specialized subagent running in its own isolated context. Returns the subagent's final result text. Use for self-contained work that would otherwise bloat your own context.",
    concurrencyExempt: true,
    parameters: z.object({
      agent: agentEnum.describe("Which subagent to spawn."),
      prompt: z.string().describe("The complete task for the subagent (it sees none of your context)."),
    }),
    execute: async ({ agent, prompt }, ctx) => {
      const forked = forkChild(ctx.control, agent);
      if (!forked.ok) {
        return { error: forked.reason, agent };
      }

      const def = await catalog.resolve(agent);
      if (!def) {
        return { error: `Unknown subagent: ${agent}`, agent };
      }

      const childHistory = emptyHistory({ systemPrompt: def.systemPrompt });
      let result: "complete" | "stopped" | "max_steps" | "error" = "error";
      let finalHistory: History = childHistory;

      for await (const ev of run(childHistory, prompt, {
        registry: def.registry,
        maxSteps: def.maxSteps,
        control: forked.child,
        signal: ctx.signal,
      })) {
        // Bubble every child event upward, tagged with its ancestry path.
        ctx.emit?.({ type: "subagent", path: forked.child.path, event: ev });
        if (ev.type === "done") {
          result = ev.result;
          finalHistory = ev.history;
        }
      }

      return { agent, result, output: lastAssistantText(finalHistory) };
    },
  });

  return { task };
}
