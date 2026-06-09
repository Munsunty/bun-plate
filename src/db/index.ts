import { Database } from "bun:sqlite";

/**
 * Single shared SQLite connection for the whole server process.
 *
 * - `strict: true` lets you bind params by name without the `$`/`:` prefix and
 *   throws on unknown columns instead of silently inserting NULL.
 * - WAL mode improves concurrent read/write throughput.
 *
 * Override the file path with `DATABASE_URL` (Bun auto-loads `.env`).
 */
export const db = new Database(process.env.DATABASE_URL ?? "bun-plate.sqlite", {
  create: true,
  strict: true,
});

db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");
