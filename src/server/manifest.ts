/**
 * Asset manifest reader. Replaces the magic that Bun's HTML-import gave us
 * (auto-injecting hashed <script>/<link> tags). `build.ts` writes
 * `dist/manifest.json`; the document renderer reads it here to inject the right
 * hashed URLs for a page's client entry and the shared stylesheet.
 *
 * Shape:
 *   { css: "/assets/styles-ab12.css",
 *     entries: { home: { js: "/assets/home-cd34.js" }, todos: { js: "..." } } }
 */

const isDev = process.env.NODE_ENV !== "production";
const MANIFEST_PATH = new URL("../../dist/manifest.json", import.meta.url).pathname;

export interface Manifest {
  css: string | null;
  entries: Record<string, { js: string }>;
}

const EMPTY: Manifest = { css: null, entries: {} };
let cached: Manifest | null = null;

/**
 * In dev the manifest is re-read every call (the client bundle may have just
 * rebuilt). In prod it's read once and cached. A missing manifest yields an
 * empty one — pages still SSR; they just won't be hydratable until a build runs.
 */
export async function getManifest(): Promise<Manifest> {
  if (cached && !isDev) return cached;
  const file = Bun.file(MANIFEST_PATH);
  if (!(await file.exists())) {
    console.warn("⚠ dist/manifest.json missing — run a client build (no hydration until then).");
    return EMPTY;
  }
  // A truncated/corrupt manifest (interrupted build, partial deploy) must not
  // 500 every render — degrade to no-assets and log loudly until it's rebuilt.
  try {
    cached = (await file.json()) as Manifest;
  } catch (error) {
    console.error("⚠ dist/manifest.json unreadable — serving pages without assets:", error);
    return EMPTY;
  }
  return cached;
}

/** Force a re-read on the next `getManifest()` (call after a dev rebuild). */
export function invalidateManifest(): void {
  cached = null;
}
