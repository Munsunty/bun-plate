import type { ReactNode } from "react";

/**
 * Persistent shell (design §1/§2). SERVER-ONLY: rendered once per full page
 * load and never hydrated — it has no interactivity (plain anchors; transitions
 * are a delegated DOM listener), so client React never touches this DOM. Its
 * "persistence" across light transitions comes from nothing touching it: only
 * `#render`'s contents are swapped.
 */

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/home", label: "Home" },
  { href: "/todos", label: "Todos" },
  { href: "/admin", label: "Admin" },
  { href: "/about", label: "About" },
];

export function Shell({ children }: { children: ReactNode }) {
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

      <main id="render">{children}</main>

      <footer className="border-t">
        <div className="container mx-auto p-4 text-center text-xs text-muted-foreground">
          Persistent shell · inner content swaps on light transitions
        </div>
      </footer>
    </>
  );
}
