import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { APITester } from "../APITester";
import { Todos } from "../Todos";
import type { Todo } from "../db/todos.repo";

/**
 * Home page body — rendered inside the inner `#render` root. Shared by SSR
 * (`src/server/pages.ts`) and the client entry (`src/client/entries/home.tsx`),
 * so the markup is identical on both sides. Receives depth-0 data as a prop; it
 * must NOT import server-only modules (db/services) — data arrives via `data`.
 *
 * Logos are referenced by URL (served statically) rather than imported, so this
 * module renders safely under the `bun` runtime during SSR.
 *
 * `data` IS the depth-0 API response (`GET /api/todos` → `Todo[]`): the value the
 * SSR draws, caches under the screen key, and the client re-fetches on hydrate.
 * Keeping page data == API response is what makes the no-flicker handoff exact.
 */
export default function Home({ data }: { data: Todo[] }) {
  return (
    <div className="container mx-auto p-8 text-center relative z-10">
      <div className="flex justify-center items-center gap-8 mb-8">
        <img
          src="/logo.svg"
          alt="Bun Logo"
          className="h-36 p-6 transition-all duration-300 hover:drop-shadow-[0_0_2em_#646cffaa] scale-120"
        />
        <img
          src="/react.svg"
          alt="React Logo"
          className="h-36 p-6 transition-all duration-300 hover:drop-shadow-[0_0_2em_#61dafbaa] [animation:spin_20s_linear_infinite]"
        />
      </div>
      <Card>
        <CardHeader className="gap-4">
          <CardTitle className="text-3xl font-bold">Bun + React SSR</CardTitle>
          <CardDescription>
            Per-page SSR · dual root · screen-key cache — no RSC, no framework
          </CardDescription>
        </CardHeader>
        <CardContent>
          <APITester />
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader className="gap-4">
          <CardTitle className="text-2xl font-bold">Todos</CardTitle>
          <CardDescription>
            SSR-rendered list, hydrated with the same data — no flicker
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Todos initial={data} />
        </CardContent>
      </Card>
    </div>
  );
}
