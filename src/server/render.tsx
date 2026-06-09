import { renderToReadableStream } from "react-dom/server";
import { createElement } from "react";
import { matchRoute, screenKeyFor } from "../routes";
import { Shell } from "../client/shell";
import { serverPages } from "./pages";
import { getManifest } from "./manifest";
import { documentHead, documentTail } from "./document";
import { setScreen } from "./screen-cache";

/**
 * Per-page SSR (design §1). For a request:
 *  1. match route → 404 if none
 *  2. run depth-0 `loadData` (Service tier, in-process) and store it in the
 *     screen-key cache so the client's hydrate re-fetch returns the same bytes
 *  3. render the page subtree to an HTML string (renderToReadableStream → text)
 *  4. stream: static head → shell (with page injected at `#render`) → static tail
 *
 * Two roots, disjoint DOM: the shell stream owns `#root`; the page HTML lives
 * inside `#render` via the shell's `dangerouslySetInnerHTML` and is hydrated by a
 * SEPARATE inner root on the client (see `src/client/boot.tsx`).
 */

const encoder = new TextEncoder();

/** Render a React element to a complete HTML string via the modern streaming API. */
async function renderToString(element: React.ReactElement): Promise<string> {
  const stream = await renderToReadableStream(element);
  await stream.allReady;
  return await new Response(stream).text();
}

export async function renderPage(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const match = matchRoute(url.pathname);
  if (!match) return new Response("Not found", { status: 404 });

  const { route, params } = match;
  const page = serverPages[route.name];
  if (!page) return new Response("Not found", { status: 404 });

  const screenKey = screenKeyFor(url.pathname);
  const data = await page.loadData(params);

  // Store the EXACT drawn value for the client's interpolation re-fetch.
  if (route.dataPath) setScreen(screenKey, data, Date.now());

  const manifest = await getManifest();
  const pageHtml = await renderToString(createElement(page.Component, { data }));

  const shellStream = await renderToReadableStream(
    createElement(Shell, { route: route.name, screenKey, pageHtml }),
    {
      onError(error) {
        console.error("SSR shell error:", error);
      },
    },
  );

  const head = documentHead({ manifest, title: `bun-plate · ${route.name}` });
  const tail = documentTail(manifest, route.clientEntry);

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(head));
      const reader = shellStream.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        controller.enqueue(value);
      }
      controller.enqueue(encoder.encode(tail));
      controller.close();
    },
  });

  return new Response(body, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
