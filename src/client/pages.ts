import type { ComponentType } from "react";

/**
 * Client-only page registry: route name → dynamic import of the page component.
 * Used for LIGHT transitions, where the target page is rendered client-side.
 *
 * Only interactive ("light") pages appear here. Static pages (e.g. About) are
 * deliberately absent, so their JS is NEVER pulled into the client bundle —
 * `routes.ts` (shared metadata) imports no components, and this is the only
 * client-side place page modules are referenced. With `splitting: true`, each
 * dynamic import becomes its own chunk, loaded on demand at transition time.
 */
export const clientPages: Record<string, () => Promise<{ default: ComponentType<{ data: any }> }>> = {
  home: () => import("../pages/home"),
  todos: () => import("../pages/todos-page"),
};
