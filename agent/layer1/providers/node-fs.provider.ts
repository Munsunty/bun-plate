import { dirname, isAbsolute, relative, resolve } from "node:path";
import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import type { DirEntry, FileStat, FsProvider } from "./types";

const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

/**
 * Bun-backed FsProvider. All safety guards (sandbox jail, size cap) live here at
 * the provider boundary so every tool inherits them for free.
 */
export class NodeFsProvider implements FsProvider {
  private readonly cwd: string;
  private readonly maxFileSize: number;

  constructor(opts?: { cwd?: string; maxFileSize?: number }) {
    this.cwd = resolve(opts?.cwd ?? process.cwd());
    this.maxFileSize = opts?.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;
  }

  resolvePath(path: string): string {
    const abs = isAbsolute(path) ? resolve(path) : resolve(this.cwd, path);
    const rel = relative(this.cwd, abs);
    if (rel === ".." || rel.startsWith(`..${"/"}`) || rel.startsWith("..\\") || isAbsolute(rel)) {
      throw new Error(`Path escapes sandbox root (${this.cwd}): ${path}`);
    }
    return abs;
  }

  async readFile(path: string): Promise<string> {
    const file = Bun.file(this.resolvePath(path));
    if (file.size > this.maxFileSize) {
      throw new Error(`File too large: ${file.size} bytes > ${this.maxFileSize} limit.`);
    }
    return await file.text();
  }

  async writeFile(path: string, content: string): Promise<void> {
    const abs = this.resolvePath(path);
    await mkdir(dirname(abs), { recursive: true });
    await Bun.write(abs, content);
  }

  async exists(path: string): Promise<boolean> {
    try {
      await stat(this.resolvePath(path));
      return true;
    } catch {
      return false;
    }
  }

  async stat(path: string): Promise<FileStat> {
    const s = await stat(this.resolvePath(path));
    return { isDirectory: s.isDirectory(), isFile: s.isFile(), size: s.size };
  }

  async readdir(path: string): Promise<DirEntry[]> {
    const entries = await readdir(this.resolvePath(path), { withFileTypes: true });
    return entries.map((e) => ({ name: e.name, isDirectory: e.isDirectory() }));
  }

  async mkdir(path: string, opts?: { recursive?: boolean }): Promise<void> {
    await mkdir(this.resolvePath(path), { recursive: opts?.recursive ?? false });
  }

  async remove(path: string, opts?: { recursive?: boolean }): Promise<void> {
    await rm(this.resolvePath(path), { recursive: opts?.recursive ?? false, force: true });
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    await rename(this.resolvePath(oldPath), this.resolvePath(newPath));
  }
}
