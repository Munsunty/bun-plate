import { Elysia, t } from "elysia";
import * as todos from "../../services/todos.service";
import type { Todo } from "../../services/todos.service";
import { getScreen } from "../../server/screen-cache";

/**
 * Todo routes. Handlers go through the Service tier (`todos.service`), never the
 * repo directly — the same entry the SSR `loadData` path uses, so there's one
 * source of truth for todo logic.
 *
 * `GET /` is the depth-0 endpoint the client re-fetches on hydrate. When the boot
 * sends `X-Screen-Key`, we return the SSR-computed value from the screen-key
 * cache (no recompute) so the hydrated markup byte-matches the SSR HTML. A miss
 * is safe — we just recompute via the Service (design §3).
 */
export const todosRoutes = new Elysia({ prefix: "/todos" })
  .get("/", ({ headers }) => {
    const key = headers["x-screen-key"];
    if (key) {
      const cached = getScreen(key, Date.now());
      if (cached !== undefined) return cached as Todo[];
    }
    return todos.list();
  })
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
