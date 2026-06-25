/**
 * Public surface of the layered agent harness (L1–L3, non-streaming).
 *
 *   L1  client + IO providers   (single OpenAI-compatible client → custom router)
 *   L2  tool SSOT + dispatcher   (Zod is the single source of truth)
 *   L3  stateless loop + 3-block history assembler
 *
 * L4 (compaction) and L5 (subagent spawn) exist under layer4/ and layer5/ but are
 * not wired into this surface yet.
 */

// L1
export { MODEL, baseURL, openaiClient } from "./layer1/client";
export { NodeFsProvider } from "./layer1/providers/node-fs.provider";
export { NodeShellProvider } from "./layer1/providers/node-shell.provider";
export type {
  DirEntry,
  Environment,
  FileStat,
  FsProvider,
  ShellProvider,
  ShellResult,
} from "./layer1/providers/types";

// L2
export { defineTool, toOpenAITool, toOpenAITools } from "./layer2/tool";
export type { ToolContext, ToolDef, ToolRegistry } from "./layer2/tool";
export { dispatchToolCall } from "./layer2/dispatch";
export type { ApproveFn, DispatchDeps, DispatchResult } from "./layer2/dispatch";
export { ToolArgValidationError, ToolDeniedError, ToolExecutionError } from "./layer2/errors";
export { createFsTools } from "./layer2/tools/fs.tools";
export { createBashTool } from "./layer2/tools/shell.tools";
export { namespaceTool } from "./layer2/mcp/seam";
export type { McpServerConfig, McpToolSource } from "./layer2/mcp/seam";

// L3
export { assemble, emptyHistory } from "./layer3/blocks";
export type { ExperienceBlock, History, IdentityBlock, TaskBlock } from "./layer3/blocks";
export type { AgentEvent } from "./layer3/events";
export { run } from "./layer3/loop";
export type { RunConfig } from "./layer3/loop";

// Runtime wiring (providers + registry + system prompt) for CLI / import / sidecar.
export { createAgentRuntime } from "./runtime";
export type { AgentRuntime } from "./runtime";
