import { Elysia } from "elysia";
import { agentRoutes } from "./routes/agent";
import { imageRoutes } from "./routes/image";
import { todosRoutes } from "./routes/todos";

/**
 * Root API. Everything lives under the `/api` prefix; mount new feature
 * route groups with `.use(...)`. The exported `Api` type powers the Eden
 * client in `src/client/client.ts`.
 */
const api = new Elysia({ prefix: "/api" })
  .get("/", () => ({ message: "Hello from Bun + Elysia" }))
  .use(todosRoutes)
  .use(imageRoutes)
  .use(agentRoutes);

export default api;

export type Api = typeof api;
