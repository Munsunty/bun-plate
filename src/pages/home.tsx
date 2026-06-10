import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { APITester } from "../APITester";
import { Todos } from "../Todos";
import { Island } from "../server/island";
import type { Todo } from "../db/todos.repo";

/**
 * Home page body — SERVER-ONLY (design §1): rendered inside `#render` by SSR
 * (full page or fragment) and never shipped to the client. Static parts are
 * plain HTML; interactive widgets are wrapped in `<Island>` markers, which is
 * the only part client React hydrates. Depth-0 data arrives as a prop and is
 * passed straight into island props (design §3, one-way handoff).
 *
 * Logos are referenced by URL (served statically) rather than imported, so this
 * module renders safely under the `bun` runtime during SSR.
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
          <Island name="api-tester" props={{}} of={APITester} />
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
          <Island name="todos" props={{ initial: data }} of={Todos} />
        </CardContent>
      </Card>
    </div>
  );
}
