import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { client } from "./client/client";
import type { Todo } from "./db/todos.repo";

/**
 * Demo of the full type-safe stack: Eden client → Elysia route → bun:sqlite.
 * Every call below is checked against the server's `Api` type — rename a route
 * or change a schema and this file fails to compile.
 */
export function Todos() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const { data, error } = await client.api.todos.get();
    if (error) return setError(String(error.value));
    setTodos(data);
    setError(null);
  };

  useEffect(() => {
    void load();
  }, []);

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
