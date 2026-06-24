import { z } from "zod";
import type { FsProvider } from "../../layer1/providers/types";
import { defineTool, type ToolDef } from "../tool";

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", ".cache"]);

/**
 * Ported `createFsTools` — provider-injected, individually-keyed ToolDefs. Each
 * tool's `execute` touches only `FsProvider` methods; paths route through
 * `resolvePath` (inside the provider) so the sandbox jail is unavoidable.
 */
export function createFsTools(p: FsProvider): {
  readFile: ToolDef;
  writeFile: ToolDef;
  editFile: ToolDef;
  listFiles: ToolDef;
  grep: ToolDef;
  deleteFile: ToolDef;
} {
  const readFile = defineTool({
    name: "readFile",
    description: "Read a UTF-8 text file. Supports optional line offset/limit windows.",
    parameters: z.object({
      path: z.string().describe("File path, relative to the sandbox root."),
      offset: z.number().int().min(0).optional().describe("1-based first line to return."),
      limit: z.number().int().min(1).optional().describe("Max lines to return."),
    }),
    execute: async ({ path, offset, limit }) => {
      const text = await p.readFile(path);
      if (offset === undefined && limit === undefined) return { path, content: text };
      const lines = text.split("\n");
      const start = offset ? offset - 1 : 0;
      const slice = lines.slice(start, limit ? start + limit : undefined);
      return { path, content: slice.join("\n"), offset: start + 1, returnedLines: slice.length };
    },
  });

  const writeFile = defineTool({
    name: "writeFile",
    description: "Create or overwrite a file (parent directories are created).",
    parameters: z.object({
      path: z.string(),
      content: z.string(),
    }),
    execute: async ({ path, content }) => {
      await p.writeFile(path, content);
      return { path, bytes: content.length, ok: true };
    },
  });

  const editFile = defineTool({
    name: "editFile",
    description: "Replace an exact substring in a file. Fails unless it occurs exactly once.",
    parameters: z.object({
      path: z.string(),
      oldString: z.string().describe("Exact text to replace (must be unique in the file)."),
      newString: z.string(),
    }),
    execute: async ({ path, oldString, newString }) => {
      const text = await p.readFile(path);
      const count = text.split(oldString).length - 1;
      if (count === 0) throw new Error("oldString not found.");
      if (count > 1) throw new Error(`oldString occurs ${count} times; must be unique.`);
      await p.writeFile(path, text.replace(oldString, newString));
      return { path, ok: true };
    },
  });

  const listFiles = defineTool({
    name: "listFiles",
    description: "List entries in a directory (skips node_modules/.git/dist/.cache).",
    parameters: z.object({
      path: z.string().default(".").describe("Directory path."),
    }),
    execute: async ({ path }) => {
      const entries = await p.readdir(path);
      return {
        path,
        entries: entries
          .filter((e) => !(e.isDirectory && SKIP_DIRS.has(e.name)))
          .map((e) => ({ name: e.name, type: e.isDirectory ? "dir" : "file" })),
      };
    },
  });

  const grep = defineTool({
    name: "grep",
    description: "Recursively search text files under a directory for a regex pattern.",
    parameters: z.object({
      pattern: z.string().describe("JavaScript regular expression."),
      path: z.string().default(".").describe("Root directory to search."),
      maxResults: z.number().int().min(1).max(500).default(100),
    }),
    execute: async ({ pattern, path, maxResults }) => {
      const re = new RegExp(pattern);
      const hits: Array<{ file: string; line: number; text: string }> = [];

      const walk = async (dir: string): Promise<void> => {
        if (hits.length >= maxResults) return;
        const entries = await p.readdir(dir);
        for (const e of entries) {
          if (hits.length >= maxResults) return;
          const child = dir === "." ? e.name : `${dir}/${e.name}`;
          if (e.isDirectory) {
            if (SKIP_DIRS.has(e.name)) continue;
            await walk(child);
          } else {
            let text: string;
            try {
              text = await p.readFile(child);
            } catch {
              continue; // unreadable / too large / binary — skip
            }
            const lines = text.split("\n");
            for (let i = 0; i < lines.length; i++) {
              if (re.test(lines[i] ?? "")) {
                hits.push({ file: child, line: i + 1, text: (lines[i] ?? "").slice(0, 300) });
                if (hits.length >= maxResults) break;
              }
            }
          }
        }
      };

      await walk(path);
      return { pattern, count: hits.length, hits };
    },
  });

  const deleteFile = defineTool({
    name: "deleteFile",
    description: "Delete a file or directory.",
    parameters: z.object({
      path: z.string(),
      recursive: z.boolean().default(false).describe("Required to delete non-empty directories."),
    }),
    execute: async ({ path, recursive }) => {
      await p.remove(path, { recursive });
      return { path, ok: true };
    },
  });

  return { readFile, writeFile, editFile, listFiles, grep, deleteFile };
}
