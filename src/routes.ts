/**
 * Route map — the single, explicit routing source (the design forbids
 * filesystem routing). This module is SHARED by server and client, so it holds
 * ONLY plain metadata: no page-component imports, no Service calls. Server-only
 * pieces live in `src/server/pages.ts`; client-only island loaders live in
 * `src/islands/registry.ts`. Keeping those out of here is what stops server
 * code from leaking into the browser bundle.
 */

export type Transition = "light" | "heavy";

export interface RouteMeta {
  /** Stable key shared by the server page registry. */
  name: string;
  /** Exact pathname this route matches. */
  pattern: string;
  /**
   * Transition grade (design §5):
   *  - "light": same shell, swap `#render` with a server fragment client-side.
   *  - "heavy": full browser navigation.
   */
  transition: Transition;
  /**
   * Page contains islands ⇒ the document includes the boot module, which
   * hydrates `[data-island]` markers. Absent ⇒ static page, zero JS shipped
   * (design principle 2).
   */
  interactive?: boolean;
}

export const routes: RouteMeta[] = [
  { name: "chat", pattern: "/", transition: "light", interactive: true },
  { name: "dashboard", pattern: "/dashboard", transition: "light", interactive: true },
  { name: "home", pattern: "/home", transition: "light", interactive: true },
  { name: "todos", pattern: "/todos", transition: "light", interactive: true },
  // Admin is a separate context → heavy (full browser navigation), still has islands.
  { name: "admin", pattern: "/admin", transition: "heavy", interactive: true },
  // Static page: not interactive → no islands, no client JS.
  { name: "about", pattern: "/about", transition: "heavy" },
];

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
