import type { Manifest } from "./manifest";

/**
 * Static HTML document template (head + tail). The `<html>/<head>/<body>` are
 * NOT React-managed — only `#root` (the shell) and `#render` (the page) are React
 * roots. This module injects the manifest-derived hashed assets that Bun's
 * HTML-import used to wire automatically:
 *   - `<link rel="stylesheet">` in <head> (render-blocking → styled first paint, no FOUC)
 *   - `<script type="module">` for the page's client entry, before </body>
 *
 * Static pages (not `interactive`) get no module script → zero client JS.
 */

const escapeAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

export interface DocumentParts {
  manifest: Manifest;
  title: string;
}

/** Everything up to and including `<div id="root">`; the shell stream follows. */
export function documentHead({ manifest, title }: DocumentParts): string {
  const css = manifest.css ? `<link rel="stylesheet" href="${escapeAttr(manifest.css)}" />` : "";
  return (
    `<!doctype html>` +
    `<html lang="en">` +
    `<head>` +
    `<meta charset="UTF-8" />` +
    `<meta name="viewport" content="width=device-width, initial-scale=1.0" />` +
    `<link rel="icon" type="image/svg+xml" href="/logo.svg" />` +
    `<title>${escapeAttr(title)}</title>` +
    css +
    `</head>` +
    `<body>` +
    `<div id="root">`
  );
}

/**
 * Closes `#root` and the document. Interactive pages (any islands) get the
 * single `boot` module, which scans `[data-island]` markers and hydrates them;
 * island data rides inline as `data-props`, so no separate data payload here.
 * Static pages get no script at all (design principle 2).
 */
export function documentTail(manifest: Manifest, interactive?: boolean): string {
  const entry = interactive ? manifest.entries["boot"] : undefined;
  const script = entry ? `<script type="module" src="${escapeAttr(entry.js)}"></script>` : "";
  return `</div>${script}</body></html>`;
}
