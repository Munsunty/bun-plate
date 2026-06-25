/**
 * Shared CLI helpers — TTY-aware ANSI color + stdout writer. Reusable across any
 * entry point; nothing here is agent-specific.
 */

// Color only when stdout is a TTY (piped/redirected output stays plain).
const tty = process.stdout.isTTY;

export const dim = (s: string) => (tty ? `\x1b[2m${s}\x1b[0m` : s);
export const bold = (s: string) => (tty ? `\x1b[1m${s}\x1b[0m` : s);
export const cyan = (s: string) => (tty ? `\x1b[36m${s}\x1b[0m` : s);

export function psWrite(s: string): boolean {
  return process.stdout.write(s);
}
