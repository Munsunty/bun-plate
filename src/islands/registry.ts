import type { ComponentType } from "react";

/**
 * Client island registry: marker name → dynamic import of the widget (design §2).
 * This is the ONLY client-side place widget modules are referenced — with
 * `splitting: true` each entry becomes its own chunk, loaded on demand when a
 * page actually contains that island. Server pages reference widgets directly
 * (they also SSR them); the names here must match `<Island name=...>` markers.
 */
export const islands: Record<string, () => Promise<ComponentType<any>>> = {
  todos: () => import("../Todos").then((m) => m.Todos),
  "api-tester": () => import("../APITester").then((m) => m.APITester),
  "sales-chart": () => import("../SalesChart").then((m) => m.SalesChart),
  "user-table": () => import("../UserTable").then((m) => m.UserTable),
};
