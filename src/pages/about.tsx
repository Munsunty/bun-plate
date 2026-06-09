import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Static page (design §1). No interactive islands, no `clientEntry` in
 * `src/routes.ts`, and NOT listed in `src/client/pages.ts` — so its JS is never
 * bundled to the browser. SSR HTML only; zero client JS; reached via a "heavy"
 * (full browser-navigation) transition. This is imported ONLY by the server
 * registry (`src/server/pages.ts`).
 */
export default function About() {
  return (
    <div className="container mx-auto p-8 max-w-2xl prose">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-bold">About</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-left">
          <p>
            This page is server-rendered as plain HTML and ships <strong>zero JavaScript</strong>.
            It is not hydrated and carries no client bundle.
          </p>
          <p>
            Architecture: per-page SSR (<code>renderToReadableStream</code>) + a persistent shell
            root with a swappable inner content root + a one-shot screen-key cache for the SSR→CSR
            data handoff. No RSC, no Next.js, no react-router.
          </p>
          <p>
            <a href="/" className="underline">← Back home</a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
