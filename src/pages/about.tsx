import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Static page (design §1). No islands and not `interactive` in `src/routes.ts`,
 * so its document carries no script at all. SSR HTML only; zero client JS;
 * reached via a "heavy" (full browser-navigation) transition. Imported ONLY by
 * the server registry (`src/server/pages.ts`).
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
            Architecture: per-page SSR (<code>renderToReadableStream</code>) with a server-owned
            shell + React islands for interactive widgets + server-fragment swaps for light
            transitions. No RSC, no Next.js, no react-router.
          </p>
          <p>
            <a href="/" className="underline">← Back home</a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
