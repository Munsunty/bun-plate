import { NodeFsProvider } from "./layer1/providers/node-fs.provider";
import { NodeShellProvider } from "./layer1/providers/node-shell.provider";
import { createFsTools } from "./layer2/tools/fs.tools";
import { createBashTool } from "./layer2/tools/shell.tools";
import type { ToolRegistry } from "./layer2/tool";

/**
 * Shared agent wiring (providers + tool registry + system prompt). Pure: building
 * a runtime touches NO LLM env — `openaiClient` is only constructed when `run()`
 * is actually called. So importing this from a server/sidecar is side-effect-free
 * apart from instantiating the (cheap) providers; reuse it across the CLI, a
 * library import, and a web sidecar.
 */
export interface AgentRuntime {
  registry: ToolRegistry;
  systemPrompt: string;
}

export function createAgentRuntime(cwd: string = process.cwd()): AgentRuntime {
  const fs = new NodeFsProvider({ cwd });
  const shell = new NodeShellProvider({ cwd });
  const registry: ToolRegistry = { ...createFsTools(fs), ...createBashTool(shell) };
  const systemPrompt = `You are a capable software engineering agent operating in ${cwd}.
Work step by step. Use tools to read, search, edit, and run code. When the task is
done, give a short, direct final answer.`;
  return { registry, systemPrompt };
}
