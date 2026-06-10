import { createElement } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { islands } from "../islands/registry";
import { installTransitions } from "./transition";
import { matchRoute } from "../routes";

/**
 * Client boot (design §2/§5). The single client entry for every interactive
 * page. Client React owns NOTHING but `[data-island]` subtrees:
 *
 *  - boot: scan the document for island markers, dynamic-import each widget,
 *    `hydrateRoot` it with the `data-props` payload (the exact value SSR drew
 *    with — design §3, one-way handoff).
 *  - light transition: fetch the target page as a server-rendered fragment,
 *    unmount the old islands, swap `#render` via innerHTML (legal — that DOM
 *    belongs to no React root), hydrate the new fragment's islands.
 *  - any failure → full browser navigation. Never a dead click.
 */

const roots = new Map<Element, Root>();

async function mountIslands(scope: ParentNode): Promise<void> {
  const markers = Array.from(scope.querySelectorAll<HTMLElement>("[data-island]"));
  await Promise.all(
    markers.map(async (el) => {
      const name = el.dataset.island!;
      const load = islands[name];
      if (!load) {
        console.error(`No island registered for "${name}"`);
        return;
      }
      const Component = await load();
      const props = el.dataset.props ? JSON.parse(el.dataset.props) : {};
      // Always hydrate: both full pages and fragments are server-rendered React
      // markup, so the existing DOM is adopted — no re-render flicker.
      roots.set(el, hydrateRoot(el, createElement(Component, props)));
    }),
  );
}

function unmountIslands(scope: ParentNode): void {
  for (const [el, root] of roots) {
    if (scope.contains(el)) {
      root.unmount(); // React runs the widget's effect cleanup (design principle 5)
      roots.delete(el);
    }
  }
}

/** Light transition: server fragment swap. Heavy/unknown/failed: full browser nav. */
async function navigate(url: URL, push: boolean): Promise<void> {
  const match = matchRoute(url.pathname);
  if (!match || match.route.transition === "heavy") {
    location.href = url.href;
    return;
  }

  const renderEl = document.getElementById("render");
  if (!renderEl) {
    location.href = url.href;
    return;
  }

  let html: string;
  try {
    const fragmentUrl = new URL(url.href);
    fragmentUrl.searchParams.set("__fragment", "1");
    const res = await fetch(fragmentUrl);
    if (!res.ok) throw new Error(`fragment fetch failed: ${res.status}`);
    html = await res.text();
  } catch {
    // Offline, deploy rotated assets, server error — let the browser do it.
    location.href = url.href;
    return;
  }

  unmountIslands(renderEl);
  renderEl.innerHTML = html;
  if (push) history.pushState({}, "", url.href);
  document.title = `bun-plate · ${match.route.name}`;

  try {
    await mountIslands(renderEl);
  } catch {
    location.href = url.href;
  }
}

void mountIslands(document);
installTransitions(navigate);
