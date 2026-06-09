import tailwind from "bun-plugin-tailwind";
import { rm } from "node:fs/promises";
import path from "node:path";

/**
 * Client bundle + asset manifest builder.
 *
 * Replaces the old HTML-import build: instead of scanning `*.html`, we build the
 * per-page client entries (`src/client/entries/*.tsx`) and a shared CSS entry
 * (`src/index.css`, processed by Tailwind). Outputs are content-hashed; a
 * `dist/manifest.json` maps each entry name → its hashed JS URL, plus the shared
 * CSS URL. The SSR document renderer reads that manifest to inject the right
 * `<script>`/`<link>` tags — the wiring Bun's HTML import used to do for us.
 *
 *   bun run build            # production (minified), runs buildClient() below
 *   index.ts (dev)           # imports buildClient() at startup + on file change
 */

const outdir = path.join(process.cwd(), "dist");

const ENTRYPOINTS = [
  "src/client/entries/home.tsx",
  "src/client/entries/todos.tsx",
  "src/index.css",
];

export async function buildClient(): Promise<boolean> {
  const isProd = process.env.NODE_ENV === "production";
  await rm(outdir, { recursive: true, force: true });

  const result = await Bun.build({
    entrypoints: ENTRYPOINTS,
    outdir,
    // Hash everything → safe immutable caching at the `/assets/*` route.
    naming: "assets/[name]-[hash].[ext]",
    plugins: [tailwind],
    splitting: true,
    minify: isProd,
    target: "browser",
    sourcemap: "linked",
    define: {
      "process.env.NODE_ENV": JSON.stringify(isProd ? "production" : "development"),
    },
  });

  if (!result.success) {
    console.error("Client build failed:");
    for (const log of result.logs) console.error(log);
    return false;
  }

  const entries: Record<string, { js: string }> = {};
  let css: string | null = null;

  for (const out of result.outputs) {
    const rel = "/" + path.relative(outdir, out.path).replaceAll("\\", "/");
    const base = path.basename(out.path);
    // The CSS entry is emitted as an asset (not kind "entry-point"); match by ext.
    if (base.endsWith(".css")) {
      css = rel;
    } else if (out.kind === "entry-point" && base.endsWith(".js")) {
      const name = base.match(/^(.*)-[A-Za-z0-9]+\.js$/)?.[1] ?? base;
      entries[name] = { js: rel };
    }
  }

  await Bun.write(path.join(outdir, "manifest.json"), JSON.stringify({ css, entries }, null, 2));

  console.log(`✓ client build: css=${css ?? "(none)"} entries=[${Object.keys(entries).join(", ")}]`);
  return true;
}

// `bun run build` / `bun build.ts`
if (import.meta.main) {
  const ok = await buildClient();
  if (!ok) process.exit(1);
}
