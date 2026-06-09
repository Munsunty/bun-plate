# bun-plate

Full-stack Bun boilerplate: **React 19 + Tailwind 4 + shadcn/ui** frontend, **Elysia** API, end-to-end type safety via **Eden**, and a **bun:sqlite** data layer with a zero-dependency migration runner.

## Stack

| Layer    | Tech                                              |
| -------- | ------------------------------------------------- |
| Runtime  | Bun (`Bun.serve` + HTML imports, HMR, bundler)    |
| Frontend | React 19, Tailwind 4, shadcn/ui                    |
| API      | Elysia (`/api` prefix), runtime-validated routes  |
| Client   | Eden treaty — typed RPC, no codegen               |
| Database | `bun:sqlite` (WAL, strict) + SQL migration runner |

## Commands

```bash
bun install        # install deps
bun dev            # dev server + HMR (auto-runs migrations)
bun start          # production server
bun run build      # bundle frontend to dist/
bun run db:migrate # apply pending migrations
bun run typecheck  # tsc --noEmit
```

Server runs at http://localhost:3000. Override the DB path with `DATABASE_URL` (Bun auto-loads `.env`).

## Structure

```
src/
  index.ts              Bun.serve: /api → Elysia, /* → SPA; runs migrations on boot
  index.html            React entry (frontend.tsx)
  App.tsx, Todos.tsx    UI (Todos demos the full typed stack)
  api/
    api.ts              root Elysia app (prefix /api) + exported `Api` type
    routes/todos.ts     feature routes with `t.*` validation
  client/client.ts      Eden client (typed from `Api`)
  db/
    index.ts            shared SQLite connection
    migrate.ts          forward-only migration runner
    migrations/*.sql    numbered, run-once
    todos.repo.ts       repository: row ↔ domain mapping, CRUD
```

## How it fits together

A route's `t.*` schema is the single source of truth: it validates requests at
runtime **and** flows as a static type to the Eden client. Rename a route or
change a schema and the React code fails to compile.

```ts
// server — src/api/routes/todos.ts
.post("/", ({ body }) => todos.create(body), { body: t.Object({ title: t.String() }) })

// client — fully typed, checked at compile time
const { data, error } = await client.api.todos.post({ title: "Write docs" });
```

## Add a feature

1. **Migration** — `src/db/migrations/0002_xxx.sql` (runs on next start).
2. **Repository** — `src/db/xxx.repo.ts` (queries + row↔domain mapping).
3. **Routes** — `src/api/routes/xxx.ts`, then `.use(xxxRoutes)` in `api.ts`.
4. **Client** — already typed; call `client.api.xxx...`.

---

Created with `bun init` (Bun v1.3.14). [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
