/**
 * Screen-key cache — a one-shot SSR→CSR handoff buffer (design §3).
 *
 * SSR runs the depth-0 fetch, draws the HTML with the result, and stores that
 * exact value here keyed by screen key (the route path). On hydrate the client
 * re-fetches the same depth-0 API with an `X-Screen-Key` header; the API returns
 * the cached value verbatim → drawn data == received data → DOM reuse, no flicker.
 *
 * This is a PURE OPTIMIZATION, not a consistency guarantee (design principle 3):
 *  - A miss (TTL expiry, eviction, or a different process instance) is safe — the
 *    API simply recomputes via the Service. One extra query, never wrong data.
 *  - Single-instance, in-memory. Multi-instance is left to probabilistic hits;
 *    no shared store (Redis) is required.
 *
 * TTL errs LONG on purpose: too-short risks expiring before the client's
 * interpolation fetch (a flicker), which is worse than holding a few KB longer.
 */

const TTL_MS = 30_000;

interface Entry {
  value: unknown;
  expires: number;
}

const store = new Map<string, Entry>();

export function setScreen(key: string, value: unknown, now: number): void {
  store.set(key, { value, expires: now + TTL_MS });
}

/** Returns the cached value, or `undefined` on miss/expiry (lazy eviction). */
export function getScreen(key: string, now: number): unknown | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (entry.expires <= now) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}
