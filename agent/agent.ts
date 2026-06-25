import { baseURL, MODEL } from "./layer1/client";
import { NodeFsProvider } from "./layer1/providers/node-fs.provider";
import { NodeShellProvider } from "./layer1/providers/node-shell.provider";
import { createBashTool } from "./layer2/tools/shell.tools";
import { createFsTools } from "./layer2/tools/fs.tools";
import type { ToolRegistry } from "./layer2/tool";
import { emptyHistory } from "./layer3/blocks";
import type { AgentEvent } from "./layer3/events";
import { run, type RunConfig } from "./layer3/loop";

// ── Layer 1: providers (sandbox jailed to the current working directory) ──────
const fs = new NodeFsProvider({ cwd: process.cwd() });
const shell = new NodeShellProvider({ cwd: process.cwd() });
const fsTools = createFsTools(fs);
const bashTool = createBashTool(shell);

// ── Layer 2: the agent's tool registry ────────────────────────────────────────
const registry: ToolRegistry = { ...fsTools, ...bashTool };

const SYSTEM_PROMPT = `You are a capable software engineering agent operating in ${process.cwd()}.
Work step by step. Use tools to read, search, edit, and run code. When the task is
done, give a short, direct final answer.`;

// ── Event rendering ───────────────────────────────────────────────────────────
// Color only when stdout is a TTY (piped/redirected output stays plain).
const tty = process.stdout.isTTY;
const dim = (s: string) => (tty ? `\x1b[2m${s}\x1b[0m` : s);
const bold = (s: string) => (tty ? `\x1b[1m${s}\x1b[0m` : s);
const cyan = (s: string) => (tty ? `\x1b[36m${s}\x1b[0m` : s);

// `text` may arrive across multiple steps (tool use between them); label the first
// chunk of each assistant turn so output never blurs into the surrounding chatter.
let labelPending = true;

function render(ev: AgentEvent): void {
  switch (ev.type) {
    case "text":
      if (labelPending) {
        process.stdout.write(bold(cyan("\nagent› ")));
        labelPending = false;
      }
      process.stdout.write(ev.text);
      break;
    case "tool.start":
      labelPending = true;
      process.stderr.write(dim(`\n→ ${ev.toolName}\n`));
      break;
    case "tool.done":
      process.stderr.write(dim(`✓ ${ev.toolName}\n`));
      break;
    case "tool.error":
      process.stderr.write(`✗ ${ev.toolName}: ${ev.error}\n`);
      break;
    case "error":
      process.stderr.write(`\nERROR: ${ev.error}\n`);
      break;
    case "done": {
      const u = ev.totalUsage;
      process.stderr.write(
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

  process.stderr.write(dim(`model=${MODEL}${baseURL ? ` @ ${baseURL}` : ""}\n`));
  process.stderr.write(`${bold("you›")} ${prompt}\n`);

  const cfg: RunConfig = { registry, maxSteps: 50 };
  const history = emptyHistory({ systemPrompt: SYSTEM_PROMPT });

  for await (const ev of run(history, prompt, cfg)) render(ev);
  process.stdout.write("\n");
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
