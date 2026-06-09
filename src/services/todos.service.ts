import * as repo from "../db/todos.repo";
import type { Todo, CreateTodo, UpdateTodo } from "../db/todos.repo";

/**
 * Service tier (the "C" in MVC — business logic). Single source of truth for
 * todo operations: BOTH the Elysia API handlers (`src/api/routes/todos.ts`) and
 * the SSR `loadData` path (`src/server/pages.ts`) call through here, never the
 * repo directly. Server-only — never imported from `src/client/**`.
 *
 * Today it's a thin pass-through to the repo; domain rules (ownership checks,
 * derived fields, side effects) land here as the app grows, in exactly one place.
 */

export type { Todo, CreateTodo, UpdateTodo };

export function list(): Todo[] {
  return repo.list();
}

export function get(id: number): Todo | null {
  return repo.get(id);
}

export function create(input: CreateTodo): Todo {
  return repo.create({ title: input.title.trim() });
}

export function update(id: number, input: UpdateTodo): Todo | null {
  return repo.update(id, input);
}

export function remove(id: number): boolean {
  return repo.remove(id);
}
