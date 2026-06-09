/**
 * Persistent shell (design §2 "outer root"). Isomorphic — imported by both the
 * SSR pipeline and the client boot, so it must render identically on both sides.
 * Mounted once into `#root` and never unmounted; only the inner `#render` content
 * is swapped on light transitions.
 *
 * The `#render` node is the dual-root boundary. Its children belong to a SEPARATE
 * React root (the inner page root), so the shell root must NOT manage them:
 *   - SSR passes `pageHtml` → injected via `dangerouslySetInnerHTML` for FCP.
 *   - Client passes `pageHtml === undefined` → the element has no React children,
 *     and `suppressHydrationWarning` tells the shell root to leave the existing
 *     server-rendered DOM (which the inner root will hydrate) untouched.
 * `data-route`/`data-screen-key` are read by the boot to drive hydration; they're
 * passed on both sides so the attributes match exactly.
 */

const NAV = [
  { href: "/", label: "Home" },
  { href: "/todos", label: "Todos" },
  { href: "/about", label: "About" },
];

export interface ShellProps {
  route: string;
  screenKey: string;
  /** Present only during SSR — the inner page rendered to an HTML string. */
  pageHtml?: string;
}

export function Shell({ route, screenKey, pageHtml }: ShellProps) {
  return (
    <>
      <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
        <nav className="container mx-auto flex items-center gap-4 p-4">
          <span className="font-bold">bun-plate</span>
          {NAV.map((item) => (
            <a key={item.href} href={item.href} className="text-sm text-muted-foreground hover:text-foreground">
              {item.label}
            </a>
          ))}
        </nav>
      </header>

      <main
        id="render"
        data-route={route}
        data-screen-key={screenKey}
        suppressHydrationWarning
        {...(pageHtml !== undefined ? { dangerouslySetInnerHTML: { __html: pageHtml } } : {})}
      />

      <footer className="border-t">
        <div className="container mx-auto p-4 text-center text-xs text-muted-foreground">
          Persistent shell · inner content swaps on light transitions
        </div>
      </footer>
    </>
  );
}
