import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { client } from "./client/client";
import type { Todo } from "./db/todos.repo";

/**
 * Interactive island: Eden client → Elysia route → bun:sqlite. Every call is
 * checked against the server's `Api` type.
 *
 * SSR data handoff (design §3/§4): the depth-0 list is rendered server-side and
 * supplied to the inner root at hydrate time via `initial`. Seeding state from
 * it (instead of fetching on mount) makes the first client render byte-match the
 * SSR markup → no hydration mismatch, no flicker. Mutations re-fetch normally.
 */
export function Todos({ initial = [] }: { initial?: Todo[] }) {
  const [todos, setTodos] = useState<Todo[]>(initial);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const { data, error } = await client.api.todos.get();
    if (error) return setError(String(error.value));
    setTodos(data);
    setError(null);
  };

  const add = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    const { error } = await client.api.todos.post({ title: trimmed });
    if (error) return setError(String(error.value));
    setTitle("");
    void load();
  };

  const toggle = async (todo: Todo) => {
    await client.api.todos({ id: todo.id }).patch({ completed: !todo.completed });
    void load();
  };

  const remove = async (id: number) => {
    await client.api.todos({ id }).delete();
    void load();
  };

  return (
    <div className="flex flex-col gap-4 text-left">
      <form onSubmit={add} className="flex items-center gap-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a todo..."
        />
        <Button type="submit">Add</Button>
      </form>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {todos.length === 0 ? (
        <p className="text-sm text-muted-foreground">No todos yet.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {todos.map((todo) => (
            <li key={todo.id} className="flex items-center gap-3 rounded-md border p-2">
              <input
                type="checkbox"
                checked={todo.completed}
                onChange={() => toggle(todo)}
                className="size-4"
              />
              <span className={todo.completed ? "flex-1 line-through text-muted-foreground" : "flex-1"}>
                {todo.title}
              </span>
              <Button variant="ghost" size="sm" onClick={() => remove(todo.id)}>
                Delete
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
