import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import { progressColorFor } from "@/shared/utils/chartColors";
import type { IIndicatorWithProgress } from "../hooks/useIndicators";
import { indicatorsPtBR as S } from "../i18n/pt-BR";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IChartPoint {
  name: string;
  pct: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function IndicatorProgressChart({
  items,
  isLoading,
}: {
  items: IIndicatorWithProgress[];
  isLoading?: boolean;
}) {
  const data = useMemo<IChartPoint[]>(() => {
    return items
      .map(({ indicator, progress }) => ({
        name: indicator.name.length > 20 ? `${indicator.name.slice(0, 18)}…` : indicator.name,
        pct: Math.round(progress.percentage),
      }))
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 12); // cap at 12 bars for readability
  }, [items]);

  return (
    <Card className="flex flex-col gap-4 p-5">
      <header className="flex items-baseline justify-between">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            Atingimento por indicador
          </h2>
          <p className="text-xs text-muted-foreground">
            Percentual de atingimento de cada indicador ativo.
          </p>
        </div>
        <Icon icon="mdi:chart-bar" size={20} className="text-muted-foreground" />
      </header>

      {isLoading ? (
        <Skeleton className="h-56 w-full" />
      ) : data.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {S.chartEmpty}
        </p>
      ) : (
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                stroke="var(--border)"
                tickLine={false}
                interval={0}
                angle={-30}
                textAnchor="end"
                height={48}
              />
              <YAxis
                tickFormatter={(v: number) => `${v}%`}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                stroke="var(--border)"
                tickLine={false}
                width={48}
              />
              <Tooltip
                cursor={false}
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--popover)",
                  color: "var(--popover-foreground)",
                  fontSize: 12,
                }}
                formatter={(value: number) => [`${value}%`, "Atingimento"]}
              />
              <Bar dataKey="pct" radius={[4, 4, 0, 0]}>
                {data.map((entry) => (
                  <Cell key={entry.name} fill={progressColorFor(entry.pct)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
