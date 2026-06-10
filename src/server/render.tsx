import { renderToReadableStream } from "react-dom/server";
import { createElement } from "react";
import { matchRoute } from "../routes";
import { Shell } from "./shell";
import { serverPages } from "./pages";
import { getManifest } from "./manifest";
import { documentHead, documentTail } from "./document";

/**
 * Per-page SSR (design §1). For a request:
 *  1. match route → 404 if none
 *  2. run depth-0 `loadData` (Service tier, in-process)
 *  3. render `<Shell><Page/></Shell>` in ONE pass and stream it between the
 *     static document head/tail. The tree is server-only — the client never
 *     hydrates the shell or page skeleton, only `[data-island]` widgets inside
 *     (whose props ride along as `data-props`, design §3).
 *
 * Fragment mode (design §5): `?__fragment=1` returns just the page subtree —
 * the light-transition client swaps it into `#render` and hydrates its islands.
 */

const encoder = new TextEncoder();

export async function renderPage(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const match = matchRoute(url.pathname);
  if (!match) return new Response("Not found", { status: 404 });

  const { route, params } = match;
  const page = serverPages[route.name];
  if (!page) return new Response("Not found", { status: 404 });

  const data = await page.loadData(params);
  const pageElement = createElement(page.Component, { data });

  if (url.searchParams.has("__fragment")) {
    const stream = await renderToReadableStream(pageElement, {
      onError(error) {
        console.error("SSR fragment error:", error);
      },
    });
    await stream.allReady;
    return new Response(stream, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const manifest = await getManifest();
  const stream = await renderToReadableStream(createElement(Shell, null, pageElement), {
    onError(error) {
      console.error("SSR error:", error);
    },
  });
  await stream.allReady;

  const head = documentHead({ manifest, title: `bun-plate · ${route.name}` });
  const tail = documentTail(manifest, route.interactive);

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(head));
      const reader = stream.getReader();
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
