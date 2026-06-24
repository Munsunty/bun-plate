import type { ToolDef } from "../tool";

/**
 * Layer 2 — MCP seam (SEAM ONLY, not implemented). Declares the boundary so an
 * external MCP client can later merge its tools into the same `ToolRegistry` the
 * dispatcher already drives — no changes needed above this line when it lands.
 *
 * A future impl wraps `@modelcontextprotocol/sdk`, lazily connects, converts each
 * MCP tool's JSON Schema → Zod → `ToolDef`, and namespaces names for >1 server.
 */

export type McpServerConfig =
  | { type: "stdio"; command: string; args: string[]; env?: Record<string, string> }
  | { type: "http"; url: string; headers?: Record<string, string> }
  | { type: "sse"; url: string; headers?: Record<string, string> };

export interface McpToolSource {
  connect(): Promise<void>;
  /** Converts remote MCP tools into local ToolDefs (JSON Schema → Zod → ToolDef). */
  listTools(): Promise<ToolDef[]>;
  close(): Promise<void>;
}

/** `serverName_toolName` namespacing, applied only when more than one server is active. */
export function namespaceTool(server: string, tool: string, multi: boolean): string {
  return multi ? `${server}_${tool}` : tool;
}
