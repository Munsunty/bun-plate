import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Island } from "../server/island";
import { SalesChart } from "../SalesChart";
import type { ActivityItem, Metric, RevenuePoint } from "../services/dashboard.service";

/**
 * Main dashboard — boilerplate template screen (design §1/§2). Server-only:
 * metric cards and the activity feed are static SSR HTML (zero client JS);
 * only the chart is an island.
 */

export interface DashboardData {
  metrics: Metric[];
  revenue: RevenuePoint[];
  activity: ActivityItem[];
}

export default function Dashboard({ data }: { data: DashboardData }) {
  return (
    <div className="container mx-auto p-8 flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Overview of your workspace</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {data.metrics.map((m) => (
          <Card key={m.label}>
            <CardHeader className="gap-1">
              <CardDescription>{m.label}</CardDescription>
              <CardTitle className="text-2xl">{m.value}</CardTitle>
            </CardHeader>
            <CardContent>
              <span className={m.delta >= 0 ? "text-xs text-green-700" : "text-xs text-red-700"}>
                {m.delta >= 0 ? "▲" : "▼"} {Math.abs(m.delta)}% vs last period
              </span>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Revenue</CardTitle>
            <CardDescription>Monthly revenue (k$)</CardDescription>
          </CardHeader>
          <CardContent>
            <Island name="sales-chart" props={{ series: data.revenue }} of={SalesChart} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>Static SSR — no JS shipped for this list</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-3">
              {data.activity.map((item) => (
                <li key={item.id} className="flex flex-col gap-0.5 text-sm">
                  <span>
                    <strong>{item.who}</strong> {item.what}
                  </span>
                  <span className="text-xs text-muted-foreground">{item.when}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
