import { baseURL, MODEL } from "./layer1/client";
import { NodeFsProvider } from "./layer1/providers/node-fs.provider";
import { NodeShellProvider } from "./layer1/providers/node-shell.provider";
import { createBashTool } from "./layer2/tools/shell.tools";
import { createFsTools } from "./layer2/tools/fs.tools";
import type { ToolRegistry } from "./layer2/tool";
import { emptyHistory } from "./layer3/blocks";
import type { AgentEvent } from "./layer3/events";
import { run, type RunConfig } from "./layer3/loop";
import { defaultEstimateTokens, type CompactionConfig } from "./layer4/compaction";
import { rootControl } from "./layer5/control";
import { StaticCatalog } from "./layer5/catalog";
import { createSpawnTool } from "./layer5/spawn.tool";

// ── Layer 1: providers (sandbox jailed to the current working directory) ──────
const fs = new NodeFsProvider({ cwd: process.cwd() });
const shell = new NodeShellProvider({ cwd: process.cwd() });
const fsTools = createFsTools(fs);
const bashTool = createBashTool(shell);

// ── Layer 5: subagent catalog (children run isolated, with scoped tool sets) ──
const catalog = new StaticCatalog([
  {
    name: "researcher",
    description: "Read-only code/file investigator. Locates and summarizes; cannot write or run commands.",
    systemPrompt:
      "You are a focused read-only investigator. Use readFile/listFiles/grep to answer the task precisely. Return a concise factual summary. You cannot modify files or run shell commands.",
    registry: { readFile: fsTools.readFile, listFiles: fsTools.listFiles, grep: fsTools.grep },
    maxSteps: 12,
  },
  {
    name: "coder",
    description: "Implements a bounded change: reads, edits/writes files, and can run shell commands.",
    systemPrompt:
      "You are a focused implementer. Make the requested change, verify it, and report exactly what you did. Keep edits surgical.",
    registry: { ...fsTools, ...bashTool },
    maxSteps: 25,
  },
]);
const { task } = createSpawnTool(catalog, catalog.names());

// ── Layer 2: the root agent's registry (full tools + privileged spawn) ────────
const registry: ToolRegistry = { ...fsTools, ...bashTool, task };

// ── Layer 5: the limiter root (invariant: maxConcurrent > maxDepth) ───────────
const control = rootControl({ maxDepth: 2, maxChildren: 8, maxConcurrent: 6 });

// ── Layer 4: compaction (opt out with AGENT_COMPACTION=off) ───────────────────
const compaction: CompactionConfig | undefined =
  process.env.AGENT_COMPACTION === "off"
    ? undefined
    : {
        triggerTokens: Number(process.env.AGENT_COMPACT_TRIGGER ?? 24_000),
        protectedTokens: Number(process.env.AGENT_COMPACT_PROTECT ?? 8_000),
        estimateTokens: defaultEstimateTokens,
      };

const SYSTEM_PROMPT = `You are a capable software engineering agent operating in ${process.cwd()}.
Work step by step. Use tools to read, search, edit, and run code. Delegate large
self-contained investigations or changes to a subagent via the \`task\` tool to keep
your own context lean. When the task is done, give a short, direct final answer.`;

// ── Event rendering ───────────────────────────────────────────────────────────
function indent(path: string[]): string {
  // root events have path.length 1 (["root"]); children deeper.
  return "  ".repeat(Math.max(0, path.length - 1));
}

function render(ev: AgentEvent, path: string[] = ["root"]): void {
  const pad = indent(path);
  switch (ev.type) {
    case "text.delta":
      process.stdout.write(ev.text);
      break;
    case "tool.start":
      process.stderr.write(`\n${pad}→ ${ev.toolName}\n`);
      break;
    case "tool.done":
      process.stderr.write(`${pad}✓ ${ev.toolName}\n`);
      break;
    case "tool.error":
      process.stderr.write(`${pad}✗ ${ev.toolName}: ${ev.error}\n`);
      break;
    case "compaction.start":
      process.stderr.write(`\n${pad}⟳ compacting (${ev.tokenCount} tok)…\n`);
      break;
    case "compaction.done":
      process.stderr.write(`${pad}⟳ compacted ${ev.tokensBefore}→${ev.tokensAfter} tok\n`);
      break;
    case "subagent":
      render(ev.event, ev.path);
      break;
    case "error":
      process.stderr.write(`\n${pad}ERROR: ${ev.error}\n`);
      break;
    case "done":
      if (path.length === 1) {
        process.stderr.write(
          `\n${pad}— ${ev.result} (${ev.totalUsage.totalTokens} tok total) —\n`,
        );
      } else {
        process.stderr.write(`${pad}⤷ subagent ${ev.result}\n`);
      }
      break;
    default:
      break; // text.done / reasoning.* / step.* — quiet
  }
}

async function main(): Promise<void> {
  const prompt = process.argv.slice(2).join(" ").trim();
  if (!prompt) {
    console.error("Usage: bun agent/agent.ts <prompt>");
    process.exit(1);
  }

  process.stderr.write(`model=${MODEL}${baseURL ? ` @ ${baseURL}` : ""}\n`);

  const cfg: RunConfig = { registry, maxSteps: 50, control, compaction };
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
