/**
 * Layer 1 — IO provider seam. Tools sit on these narrow interfaces only, never on
 * `node:fs` / `Bun.$` directly, so the backend (Bun-native, in-memory, remote) is
 * swappable and `resolvePath` stays the single sandbox chokepoint.
 */

export interface FileStat {
  isDirectory: boolean;
  isFile: boolean;
  size: number;
}

export interface DirEntry {
  name: string;
  isDirectory: boolean;
}

export interface ShellResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface FsProvider {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  stat(path: string): Promise<FileStat>;
  readdir(path: string): Promise<DirEntry[]>;
  mkdir(path: string, opts?: { recursive?: boolean }): Promise<void>;
  remove(path: string, opts?: { recursive?: boolean }): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  /** Normalize + jail a path under the sandbox root. The one safety chokepoint. */
  resolvePath(path: string): string;
}

export interface ShellProvider {
  exec(
    cmd: string,
    opts?: { timeout?: number; cwd?: string; env?: Record<string, string> },
  ): Promise<ShellResult>;
}

export interface Environment {
  fs: FsProvider;
  shell: ShellProvider;
}
