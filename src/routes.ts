/**
 * Route map — the single, explicit routing source (the design forbids
 * filesystem routing). This module is SHARED by server and client, so it holds
 * ONLY plain metadata: no page-component imports, no Service calls. Server-only
 * pieces live in `src/server/pages.ts`; client-only dynamic imports live in
 * `src/client/pages.ts`. Keeping those out of here is what stops server code (or
 * static pages' JS) from leaking into the browser bundle.
 */

export type Transition = "light" | "heavy";

export interface RouteMeta {
  /** Stable key shared across server/client registries and the asset manifest. */
  name: string;
  /** Exact pathname this route matches. */
  pattern: string;
  /**
   * Transition grade (design §5):
   *  - "light": same shell, swap `#render` client-side (needs a client entry).
   *  - "heavy": full browser navigation; no client entry required.
   */
  transition: Transition;
  /**
   * Depth-0 API path the client re-fetches on hydrate (design §3/§4). The boot
   * sends `X-Screen-Key` so the server returns the SSR-computed value from the
   * screen-key cache. Omit for pages with no depth-0 data.
   */
  dataPath?: string;
  /**
   * Manifest key for this page's client bundle. Present ⇒ the page hydrates.
   * Absent ⇒ static page, zero JS shipped (design §1 "static → no JS").
   */
  clientEntry?: string;
}

export const routes: RouteMeta[] = [
  { name: "home", pattern: "/", transition: "light", dataPath: "/api/todos", clientEntry: "home" },
  { name: "todos", pattern: "/todos", transition: "light", dataPath: "/api/todos", clientEntry: "todos" },
  // Static page: no clientEntry, no dataPath → no hydration, no client JS.
  { name: "about", pattern: "/about", transition: "heavy" },
];

/**
 * Screen key for the depth-0 handoff cache. Centralized so the SSR write side
 * and the client re-fetch side derive the IDENTICAL key (a mismatch silently
 * degrades to a cache miss → correct but flickery). Currently the pathname.
 */
export function screenKeyFor(pathname: string): string {
  return pathname === "" ? "/" : pathname;
}

export interface RouteMatch {
  route: RouteMeta;
  params: Record<string, string>;
}

/**
 * Exact-match router. Extension point: to support `/todos/:id`, parse `pattern`
 * segments here and fill `params` — the rest of the system already threads
 * `params` through `loadData` and the page components.
 */
export function matchRoute(pathname: string): RouteMatch | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  const route = routes.find((r) => r.pattern === path);
  return route ? { route, params: {} } : null;
}
