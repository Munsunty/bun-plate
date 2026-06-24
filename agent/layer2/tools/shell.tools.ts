import { z } from "zod";
import type { ShellProvider } from "../../layer1/providers/types";
import { defineTool, type ToolDef } from "../tool";

/** Ported `createBashTool` — provider-injected shell access. */
export function createBashTool(p: ShellProvider): { bash: ToolDef } {
  const bash = defineTool({
    name: "bash",
    description:
      "Run a shell command via `sh -c`. Returns stdout/stderr (truncated) and the exit code. Non-zero exit does not throw.",
    parameters: z.object({
      command: z.string().describe("The shell command to run."),
      cwd: z.string().optional().describe("Working directory."),
      timeout: z.number().int().min(1).optional().describe("Timeout in milliseconds."),
    }),
    execute: async ({ command, cwd, timeout }) => {
      const result = await p.exec(command, { cwd, timeout });
      return result;
    },
  });

  return { bash };
}
