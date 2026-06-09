import { treaty } from "@elysia/eden";
import type { Api } from "../api/api";

/**
 * Type-safe API client. Types are derived from the server's `Api` type at
 * compile time — no codegen, no runtime coupling. The `import type` above is
 * fully erased, so no server code (or `bun:sqlite`) leaks into the browser bundle.
 *
 * Usage:
 *   const { data, error } = await client.api.todos.get();
 *   await client.api.todos.post({ title: "Write docs" });
 *   await client.api.todos({ id }).patch({ completed: true });
 *   await client.api.todos({ id }).delete();
 */
export const client = treaty<Api>(
  typeof window !== "undefined" ? window.location.origin : "http://localhost:3000",
);
