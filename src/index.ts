import { serve } from "bun";
import index from "./index.html";
import api from "./api/api";
import { migrate } from "./db/migrate";

// Apply any pending migrations before accepting traffic (idempotent).
await migrate();

const server = serve({
  routes: {
    // Type-safe Elysia API. Both the bare prefix and sub-paths forward the
    // full request to Elysia, which owns all routing under `/api`.
    "/api": api.fetch,
    "/api/*": api.fetch,

    // Serve index.html for everything else (SPA fallback).
    "/*": index,
  },

  development: process.env.NODE_ENV !== "production" && {
    // Enable browser hot reloading in development
    hmr: true,

    // Echo console logs from the browser to the server
    console: true,
  },
});

console.log(`🚀 Server running at ${server.url}`);
