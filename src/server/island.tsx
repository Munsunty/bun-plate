import type { ComponentType } from "react";

/**
 * Island marker (design §2). Server-only. Wraps an interactive widget in a
 * `data-island` container: SSR renders the widget's HTML inside it (fast first
 * paint), and the client boot scans for the marker, loads the matching
 * component from `src/islands/registry.ts`, and hydrates ONLY this subtree.
 * Everything outside islands is server-owned HTML the client React never sees.
 *
 * `props` must be JSON-serializable (design §3) — the same value is drawn AND
 * serialized into `data-props`, so drawn data == hydrated data by construction.
 */
export function Island<P extends object>({
  name,
  props,
  of: Component,
}: {
  /** Key in the client island registry. */
  name: string;
  props: P;
  of: ComponentType<P>;
}) {
  return (
    <div data-island={name} data-props={JSON.stringify(props)}>
      <Component {...props} />
    </div>
  );
}
