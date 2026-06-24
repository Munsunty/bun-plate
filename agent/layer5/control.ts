/**
 * Layer 5 — the limiter. One `ControlContext` threads through the whole agent tree
 * and gates every privileged op (tool execution AND subagent spawn) through the
 * same chokepoint.
 *
 * Data flow:
 *  - `concurrency` is ONE object shared by reference across the entire tree → a
 *    single global cap on simultaneous tool/agent work.
 *  - `depth` and `spawnBudget` flow DOWN by value-decrement (each fork gets a copy
 *    with depth-1; the shared budget is mutated so siblings see each other's spend).
 *
 * Deadlock-freedom: the `task` spawn tool is `concurrencyExempt`, so an orchestrator
 * waiting on a child holds no slot. Only real leaf tool executions consume slots, and
 * each completes and releases without waiting on another slot-holder — so no spawn
 * chain or sibling fan-out can deadlock, for any `maxConcurrent >= 1`.
 */

interface Concurrency {
  max: number;
  active: number;
  /** FIFO of parked acquirers, woken by direct slot handoff (no re-acquire race). */
  waiters: Array<() => void>;
}

export interface ControlContext {
  /** Remaining nesting allowance; a child at depth 0 cannot spawn further. */
  depth: number;
  /** Remaining children this subtree may create (shared/decremented across forks). */
  spawnBudget: number;
  /** Global concurrency semaphore, shared by reference across the tree. */
  concurrency: Concurrency;
  /** Ancestry, outermost → innermost (e.g. ["root", "researcher"]). */
  path: string[];
  signal?: AbortSignal;
}

export function rootControl(opts: {
  maxDepth: number;
  maxChildren: number;
  maxConcurrent: number;
  signal?: AbortSignal;
}): ControlContext {
  if (opts.maxConcurrent < 1) {
    throw new Error(`rootControl: maxConcurrent must be >= 1 (got ${opts.maxConcurrent}).`);
  }
  return {
    depth: opts.maxDepth,
    spawnBudget: opts.maxChildren,
    concurrency: { max: opts.maxConcurrent, active: 0, waiters: [] },
    path: ["root"],
    signal: opts.signal,
  };
}

/**
 * Acquire one concurrency slot for the duration of `fn`. Gates EVERY tool call
 * (the L2 dispatcher wraps each execute in this) — the same gate spawns pass
 * through. Uses direct slot handoff so `active` can never transiently exceed `max`.
 */
export async function withSlot<T>(c: ControlContext, fn: () => Promise<T>): Promise<T> {
  const conc = c.concurrency;
  if (conc.active >= conc.max) {
    // Park until a finishing holder hands us its slot (active stays accounted).
    await new Promise<void>((res) => conc.waiters.push(res));
  } else {
    conc.active += 1;
  }
  try {
    return await fn();
  } finally {
    const next = conc.waiters.shift();
    if (next) next(); // hand the slot over directly; `active` unchanged
    else conc.active -= 1;
  }
}

/**
 * Spawn gate: enforce max nesting depth + per-subtree spawn budget, returning a
 * decremented child context. The same `concurrency` object is carried by reference
 * so the cap is global. Refusals come back as data (rendered to the model as a tool
 * error), never thrown.
 */
export function forkChild(
  parent: ControlContext,
  childName: string,
):
  | { ok: true; child: ControlContext }
  | { ok: false; reason: "max_depth" | "spawn_budget_exhausted" } {
  if (parent.depth <= 0) return { ok: false, reason: "max_depth" };
  if (parent.spawnBudget <= 0) return { ok: false, reason: "spawn_budget_exhausted" };
  parent.spawnBudget -= 1; // mutate shared budget so siblings observe the spend
  return {
    ok: true,
    child: {
      depth: parent.depth - 1,
      spawnBudget: parent.spawnBudget,
      concurrency: parent.concurrency,
      path: [...parent.path, childName],
      signal: parent.signal,
    },
  };
}
