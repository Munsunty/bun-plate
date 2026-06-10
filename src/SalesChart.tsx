import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { RevenuePoint } from "./services/dashboard.service";

/**
 * Interactive island: revenue bar chart with a client-side period filter.
 * Data arrives once via island props (design §3); switching periods is pure
 * client state — no fetch, demonstrating an island that owns local UI state.
 */

const PERIODS = [3, 6, 12] as const;

export function SalesChart({ series }: { series: RevenuePoint[] }) {
  const [months, setMonths] = useState<(typeof PERIODS)[number]>(12);
  const visible = series.slice(-months);
  const max = Math.max(...visible.map((p) => p.value));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-end gap-1">
        {PERIODS.map((p) => (
          <Button
            key={p}
            size="sm"
            variant={months === p ? "secondary" : "ghost"}
            onClick={() => setMonths(p)}
          >
            {p}M
          </Button>
        ))}
      </div>

      <div className="flex items-end gap-2 h-40">
        {visible.map((point) => (
          <div key={point.month} className="flex-1 flex flex-col items-center gap-1">
            <span className="text-xs text-muted-foreground">{point.value}</span>
            <div
              className="w-full rounded-t bg-primary/80 transition-all duration-300"
              style={{ height: `${(point.value / max) * 100}%` }}
            />
            <span className="text-xs text-muted-foreground">{point.month}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
