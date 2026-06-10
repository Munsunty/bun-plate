import { Elysia, t } from "elysia";
import * as todos from "../../services/todos.service";

/**
 * Todo routes. Handlers go through the Service tier (`todos.service`), never the
 * repo directly — the same entry the SSR `loadData` path uses, so there's one
 * source of truth for todo logic.
 *
 * `GET /` is the depth-0 endpoint light navigations fetch. Hydration no longer
 * touches it — the SSR data island carries the drawn value — so this stays a
 * plain business endpoint with no SSR plumbing.
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
