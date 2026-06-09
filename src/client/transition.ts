import { matchRoute } from "../routes";

/**
 * Transition wiring (design §5). A single delegated click listener + popstate.
 * The actual swap/navigation is delegated to `navigate` (in `boot.tsx`), which
 * owns the inner-root handle. This module only decides whether to intercept:
 *
 *  - LIGHT route → preventDefault, hand to `navigate` (client-side `#render` swap).
 *  - HEAVY route / external / unknown / modified click → do nothing → the browser
 *    performs a full navigation (zero zombie listeners; no partial-swap cost).
 */

export type Navigate = (url: URL, push: boolean) => void;

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
    // Heavy, unknown, or non-hydratable → let the browser navigate normally.
    if (!match || match.route.transition === "heavy" || !match.route.clientEntry) return;

    e.preventDefault();
    navigate(url, true);
  });

  window.addEventListener("popstate", () => {
    navigate(new URL(location.href), false);
  });
}
