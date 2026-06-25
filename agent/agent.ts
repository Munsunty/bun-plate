import { baseURL, MODEL } from "./layer1/client";
import { emptyHistory } from "./layer3/blocks";
import type { AgentEvent } from "./layer3/events";
import { run, type RunConfig } from "./layer3/loop";
import { createAgentRuntime } from "./runtime";
import { bold, cyan, dim, psWrite } from "./utils";

// Shared wiring (providers + registry + system prompt), same factory the sidecar uses.
const { registry, systemPrompt: SYSTEM_PROMPT } = createAgentRuntime();

// ── Event rendering ───────────────────────────────────────────────────────────
// `text` may arrive across multiple steps (tool use between them); label the first
// chunk of each assistant turn so output never blurs into the surrounding chatter.
let labelPending = true;

function render(ev: AgentEvent): void {
  switch (ev.type) {
    case "text":
      if (labelPending) {
        psWrite(bold(cyan("\nagent› ")));
        labelPending = false;
      }
      psWrite(ev.text);
      break;
    case "tool.start":
      labelPending = true;
      psWrite(dim(`\n→ ${ev.toolName}\n`));
      break;
    case "tool.done":
      psWrite(dim(`✓ ${ev.toolName}\n`));
      break;
    case "tool.error":
      psWrite(`✗ ${ev.toolName}: ${ev.error}\n`);
      break;
    case "error":
      psWrite(`\nERROR: ${ev.error}\n`);
      break;
    case "done": {
      const u = ev.totalUsage;
      psWrite(
        dim(`\n— ${ev.result} (in ${u.inputTokens} / out ${u.outputTokens} / ${u.totalTokens} tok) —\n`),
      );
      break;
    }
    default:
      break; // step.start / step.done — quiet
  }
}

async function main(): Promise<void> {
  const prompt = process.argv.slice(2).join(" ").trim();
  if (!prompt) {
    console.error("Usage: bun agent/agent.ts <prompt>");
    process.exit(1);
  }

  psWrite(dim(`model=${MODEL}${baseURL ? ` @ ${baseURL}` : ""}\n`));
  process.stderr.write(`${bold("you›")} ${prompt}\n`);

  const cfg: RunConfig = { registry, maxSteps: 50 };
  const history = emptyHistory({ systemPrompt: SYSTEM_PROMPT });

  for await (const ev of run(history, prompt, cfg)) render(ev);
  psWrite("\n");
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
