import { createElement, type ComponentType } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { Shell } from "./shell";
import { clientPages } from "./pages";
import { installTransitions } from "./transition";
import { matchRoute, screenKeyFor } from "../routes";

/**
 * Client boot (design §3/§4). Each per-page entry (`src/client/entries/*.tsx`)
 * imports its page component statically and calls `bootPage` with it.
 *
 * First paint:
 *   1. interpolation fetch — depth-0 data via the same API, with `X-Screen-Key`
 *      so the screen-key cache returns the SSR-drawn value (no recompute). Done
 *      BEFORE hydrate so the inner root's first render byte-matches the SSR HTML.
 *   2. hydrate the inner `#render` root with that data (page content).
 *   3. hydrate the outer `#root` shell (persistent). Inner-first so `#render`'s
 *      children are already claimed; the shell renders `#render` childless +
 *      `suppressHydrationWarning` so the outer root leaves them be.
 *   4. install transition listeners.
 */

type PageComponent = ComponentType<{ data: any }>;

let innerRoot: Root | null = null;

async function fetchDepth0(dataPath: string | undefined, screenKey: string, useCache: boolean): Promise<unknown> {
  if (!dataPath) return null;
  // The screen-key header is sent ONLY on the first hydrate fetch. Later (light
  // navigation) fetches omit it → the cache is bypassed → always-fresh data
  // (design §4: "2번째 턴 이후는 캐시 없이 정식 fetch").
  const headers = useCache ? { "X-Screen-Key": screenKey } : undefined;
  const res = await fetch(dataPath, { headers });
  return res.ok ? await res.json() : null;
}

export async function bootPage(InitialPage: PageComponent): Promise<void> {
  const rootEl = document.getElementById("root");
  const renderEl = document.getElementById("render");
  if (!rootEl || !renderEl) return;

  const routeName = renderEl.dataset.route ?? matchRoute(location.pathname)?.route.name ?? "";
  const screenKey = renderEl.dataset.screenKey ?? screenKeyFor(location.pathname);
  const dataPath = matchRoute(location.pathname)?.route.dataPath;

  const data = await fetchDepth0(dataPath, screenKey, true);

  innerRoot = hydrateRoot(renderEl, createElement(InitialPage, { data }));
  hydrateRoot(rootEl, createElement(Shell, { route: routeName, screenKey }));

  installTransitions(navigate);
}

/** Light transition: swap `#render` client-side. Heavy/unknown: full browser nav. */
async function navigate(url: URL, push: boolean): Promise<void> {
  const match = matchRoute(url.pathname);
  if (!match || match.route.transition === "heavy" || !match.route.clientEntry) {
    location.href = url.href;
    return;
  }

  const { route } = match;
  const screenKey = screenKeyFor(url.pathname);
  const loader = clientPages[route.name];
  if (!loader) {
    location.href = url.href;
    return;
  }

  const [{ default: NewPage }, data] = await Promise.all([loader(), fetchDepth0(route.dataPath, screenKey, false)]);

  const renderEl = document.getElementById("render");
  if (!renderEl) return;

  // Unmount → createRoot → render. unmount() runs the old page's effect cleanup,
  // listeners, subscriptions, timers — delegated to React (no manual teardown).
  innerRoot?.unmount();
  renderEl.dataset.route = route.name;
  renderEl.dataset.screenKey = screenKey;
  innerRoot = createRoot(renderEl);
  innerRoot.render(createElement(NewPage, { data }));

  if (push) history.pushState({ route: route.name }, "", url.href);
}
