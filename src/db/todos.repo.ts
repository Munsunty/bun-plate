import { db } from "./index";

/** Raw row shape as stored in SQLite (no native boolean → `completed` is 0/1). */
interface TodoRow {
  id: number;
  title: string;
  completed: number;
  created_at: string;
}

/** Domain model exposed to the rest of the app (and, via Eden, to the client). */
export interface Todo {
  id: number;
  title: string;
  completed: boolean;
  created_at: string;
}

export interface CreateTodo {
  title: string;
}

export interface UpdateTodo {
  title?: string;
  completed?: boolean;
}

const toTodo = (row: TodoRow): Todo => ({
  id: row.id,
  title: row.title,
  completed: row.completed === 1,
  created_at: row.created_at,
});

// `db.query()` compiles lazily and caches by SQL text, so calling it inside each
// function is both cheap (reused after first call) and safe (no compilation at
// import time, before migrations have created the table).

export function list(): Todo[] {
  return db
    .query<TodoRow, []>("SELECT * FROM todos ORDER BY id DESC")
    .all()
    .map(toTodo);
}

export function get(id: number): Todo | null {
  const row = db
    .query<TodoRow, { id: number }>("SELECT * FROM todos WHERE id = $id")
    .get({ id });
  return row ? toTodo(row) : null;
}

export function create(input: CreateTodo): Todo {
  const row = db
    .query<TodoRow, { title: string }>(
      "INSERT INTO todos (title) VALUES ($title) RETURNING *",
    )
    .get({ title: input.title });
  return toTodo(row!);
}

export function update(id: number, input: UpdateTodo): Todo | null {
  const sets: string[] = [];
  const params: Record<string, string | number> = { id };

  if (input.title !== undefined) {
    sets.push("title = $title");
    params.title = input.title;
  }
  if (input.completed !== undefined) {
    sets.push("completed = $completed");
    params.completed = input.completed ? 1 : 0;
  }
  if (sets.length === 0) return get(id);

  const row = db
    .query<TodoRow, typeof params>(
      `UPDATE todos SET ${sets.join(", ")} WHERE id = $id RETURNING *`,
    )
    .get(params);
  return row ? toTodo(row) : null;
}

export function remove(id: number): boolean {
  const row = db
    .query<{ id: number }, { id: number }>(
      "DELETE FROM todos WHERE id = $id RETURNING id",
    )
    .get({ id });
  return row !== null;
}
