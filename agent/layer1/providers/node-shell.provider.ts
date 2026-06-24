import type { ShellProvider, ShellResult } from "./types";

const DEFAULT_MAX_STDOUT = 50_000;
const DEFAULT_MAX_STDERR = 10_000;
/** Grace after process exit to flush buffered output before abandoning the pipe. */
const DRAIN_GRACE_MS = 200;
const POLL_MS = 50;

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n…[truncated ${s.length - max} chars]`;
}

/**
 * Read a stream to a string, but stop `graceMs` after the process exits. A timed-out
 * shell is killed, yet an orphaned child (e.g. `sleep` reparented to init) can keep
 * the pipe's write end open — `Response(stream).text()` would then block long past the
 * timeout. Polling lets us cancel the read and return promptly with what we captured.
 */
async function collectBounded(
  stream: ReadableStream<Uint8Array>,
  exited: Promise<number>,
  graceMs: number,
): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = "";
  let exitedAt = 0;
  void exited.then(() => {
    exitedAt = performance.now();
  });
  try {
    while (true) {
      if (exitedAt && performance.now() - exitedAt > graceMs) break;
      const tick = new Promise<typeof TICK>((r) => setTimeout(() => r(TICK), POLL_MS));
      const res = await Promise.race([reader.read(), tick]);
      if (res === TICK) continue; // wake to re-check the exit deadline
      if (res.done) break;
      if (res.value) out += decoder.decode(res.value, { stream: true });
    }
  } finally {
    void reader.cancel().catch(() => {});
  }
  return out + decoder.decode();
}
const TICK = Symbol("tick");

/**
 * `Bun.spawn`-backed ShellProvider. Captures exit codes (never throws on non-zero),
 * truncates output, and ENFORCES the timeout — both the kill (Bun's `$` shell offers
 * no timeout; `Bun.spawn` does) and a bounded wall-clock for output collection.
 */
export class NodeShellProvider implements ShellProvider {
  private readonly cwd: string;
  private readonly maxStdout: number;
  private readonly maxStderr: number;

  constructor(opts?: { cwd?: string; maxStdout?: number; maxStderr?: number }) {
    this.cwd = opts?.cwd ?? process.cwd();
    this.maxStdout = opts?.maxStdout ?? DEFAULT_MAX_STDOUT;
    this.maxStderr = opts?.maxStderr ?? DEFAULT_MAX_STDERR;
  }

  async exec(
    cmd: string,
    opts?: { timeout?: number; cwd?: string; env?: Record<string, string> },
  ): Promise<ShellResult> {
    const proc = Bun.spawn(["sh", "-c", cmd], {
      cwd: opts?.cwd ?? this.cwd,
      env: opts?.env ? { ...process.env, ...opts.env } : process.env,
      stdout: "pipe",
      stderr: "pipe",
      ...(opts?.timeout ? { timeout: opts.timeout, killSignal: "SIGTERM" } : {}),
    });

    const [stdout, stderr, exitCode] = await Promise.all([
      collectBounded(proc.stdout, proc.exited, DRAIN_GRACE_MS),
      collectBounded(proc.stderr, proc.exited, DRAIN_GRACE_MS),
      proc.exited,
    ]);

    return {
      stdout: truncate(stdout, this.maxStdout),
      stderr: truncate(stderr, this.maxStderr),
      exitCode,
    };
  }
}
