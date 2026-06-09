import { Glob } from "bun";
import path from "node:path";
import { db } from "./index";

/**
 * Minimal forward-only migration runner — zero dependencies.
 *
 * Drop numbered `*.sql` files in `migrations/` (e.g. `0002_add_users.sql`).
 * Each file runs once, inside a transaction, in filename order. Applied files
 * are recorded in `schema_migrations` so re-running is a no-op.
 *
 * Run standalone: `bun run db:migrate`
 * Runs automatically on server start (see `src/index.ts`).
 */
export async function migrate(): Promise<void> {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const applied = new Set(
    db
      .query<{ name: string }, []>("SELECT name FROM schema_migrations")
      .all()
      .map((row) => row.name),
  );

  const dir = path.join(import.meta.dir, "migrations");
  const files = [...new Glob("*.sql").scanSync({ cwd: dir })].sort();

  let count = 0;
  for (const name of files) {
    if (applied.has(name)) continue;

    const sql = await Bun.file(path.join(dir, name)).text();
    // Each migration is atomic: schema change + bookkeeping commit together.
    db.transaction(() => {
      db.exec(sql);
      db.query("INSERT INTO schema_migrations (name) VALUES (?)").run(name);
    })();

    console.log(`✓ migrated ${name}`);
    count++;
  }

  console.log(count ? `Applied ${count} migration(s).` : "Database up to date.");
}

// Allow running directly: `bun src/db/migrate.ts`
if (import.meta.main) {
  await migrate();
}
