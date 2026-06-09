import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Todos } from "../Todos";
import type { Todo } from "../db/todos.repo";

/**
 * Dedicated todos page — a second "light" route so light transitions can be
 * exercised (swap `/` ↔ `/todos` without a full reload). `data` is the depth-0
 * API response (`Todo[]`), same as Home.
 */
export default function TodosPage({ data }: { data: Todo[] }) {
  return (
    <div className="container mx-auto p-8 max-w-xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-bold">All Todos</CardTitle>
        </CardHeader>
        <CardContent>
          <Todos initial={data} />
        </CardContent>
      </Card>
    </div>
  );
}
