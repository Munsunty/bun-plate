import { matchRoute } from "../routes";

/**
 * Transition wiring (design §5). A single delegated click listener + popstate.
 * The actual swap/navigation is delegated to `navigate` (in `boot.ts`), which
 * owns the island roots. This module only decides whether to intercept:
 *
 *  - LIGHT route → preventDefault, hand to `navigate` (client-side `#render` swap).
 *  - HEAVY route / external / unknown / modified click → do nothing → the browser
 *    performs a full navigation (zero zombie listeners; no partial-swap cost).
 */

// May be async; `navigate` handles its own failures (full-nav fallback), so
// call sites fire-and-forget safely.
export type Navigate = (url: URL, push: boolean) => void | Promise<void>;

export function installTransitions(navigate: Navigate): void {
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    const anchor = (e.target as HTMLElement | null)?.closest("a");
    if (!anchor) return;

    const href = anchor.getAttribute("href");
    if (!href || anchor.target === "_blank" || anchor.hasAttribute("download")) return;

    const url = new URL(href, location.href);
    if (url.origin !== location.origin) return; // external → browser

    const match = matchRoute(url.pathname);
    // Heavy or unknown → let the browser navigate normally.
    if (!match || match.route.transition === "heavy") return;

    e.preventDefault();
    void navigate(url, true);
  });

  window.addEventListener("popstate", () => {
    void navigate(new URL(location.href), false);
  });
}
