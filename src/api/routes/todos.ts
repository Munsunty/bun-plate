import { Elysia, t } from "elysia";
import * as todos from "../../db/todos.repo";

/**
 * Todo routes. The `t.*` schemas validate input at runtime AND flow to the
 * Eden client as static types — one source of truth for the API contract.
 */
export const todosRoutes = new Elysia({ prefix: "/todos" })
  .get("/", () => todos.list())
  .post("/", ({ body }) => todos.create(body), {
    body: t.Object({ title: t.String({ minLength: 1 }) }),
  })
  .get(
    "/:id",
    ({ params, status }) => todos.get(params.id) ?? status(404, "Todo not found"),
    { params: t.Object({ id: t.Number() }) },
  )
  .patch(
    "/:id",
    ({ params, body, status }) =>
      todos.update(params.id, body) ?? status(404, "Todo not found"),
    {
      params: t.Object({ id: t.Number() }),
      body: t.Object({
        title: t.Optional(t.String({ minLength: 1 })),
        completed: t.Optional(t.Boolean()),
      }),
    },
  )
  .delete(
    "/:id",
    ({ params, status }) =>
      todos.remove(params.id) ? status(204) : status(404, "Todo not found"),
    { params: t.Object({ id: t.Number() }) },
  );
