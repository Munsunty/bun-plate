import { serve } from "bun";
import path from "node:path";
import { watch } from "node:fs";
import api from "./api/api";
import { migrate } from "./db/migrate";
import { renderPage } from "./server/render";
import { invalidateManifest } from "./server/manifest";
import { buildClient } from "../build";

// Apply any pending migrations before accepting traffic (idempotent).
await migrate();

const isDev = process.env.NODE_ENV !== "production";
const distDir = path.join(process.cwd(), "dist");

// In dev, build the client bundle on startup so pages are hydratable, then
// rebuild on client-source changes. (`bun --hot` already hot-reloads server
// modules — render/routes/services/pages — but not the browser bundle.) The
// global guard keeps `--hot` re-executions from stacking watchers.
if (isDev) {
  await buildClient();
  const g = globalThis as { __clientWatch?: boolean };
  if (!g.__clientWatch) {
    g.__clientWatch = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    watch(path.join(process.cwd(), "src"), { recursive: true }, (_e, file) => {
      if (file && (file.endsWith(".map") || file.includes("dist"))) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        if (await buildClient()) invalidateManifest();
      }, 120);
    });
  }
}

/** Serve a hashed, immutable build artifact from `dist/`. */
async function serveAsset(req: Request): Promise<Response> {
  const { pathname } = new URL(req.url);
  // pathname is URL-normalized (no `..`); strip the leading slash and resolve.
  const file = Bun.file(path.join(distDir, pathname.slice(1)));
  if (!(await file.exists())) return new Response("Not found", { status: 404 });
  return new Response(file, {
    headers: { "Cache-Control": "public, max-age=31536000, immutable" },
  });
}

const svg = (name: string) => () => new Response(Bun.file(path.join(process.cwd(), "src", name)));

const server = serve({
  routes: {
    // Type-safe Elysia API (owns all routing under `/api`).
    "/api": api.fetch,
    "/api/*": api.fetch,

    // Hashed client bundle + CSS (built into dist/assets).
    "/assets/*": serveAsset,

    // Static logos referenced by URL (kept out of component imports so pages
    // render under the `bun` runtime during SSR).
    "/logo.svg": svg("logo.svg"),
    "/react.svg": svg("react.svg"),

    // Everything else → per-page SSR.
    "/*": renderPage,
  },

  development: isDev && {
    // Echo browser console logs to the server.
    console: true,
  },
});

console.log(`🚀 Server running at ${server.url}`);
