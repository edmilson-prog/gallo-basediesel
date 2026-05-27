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
import type { IGoalWithProgress } from "../hooks/useGoalsWithProgress";

export interface ISellerProgressBarChartProps {
  items: IGoalWithProgress[];
  sellerNames: Map<string, string>;
  isLoading?: boolean;
}

interface IPoint {
  sellerName: string;
  averagePct: number;
}

function colorFor(pct: number): string {
  if (pct >= 100) return "#16a34a"; // emerald-600
  if (pct >= 70) return "#f59e0b"; // amber-500
  return "#dc2626"; // red-600
}

export function SellerProgressBarChart({
  items,
  sellerNames,
  isLoading,
}: ISellerProgressBarChartProps) {
  const data = useMemo<IPoint[]>(() => {
    const bySeller = new Map<string, number[]>();
    for (const { goal, progress } of items) {
      if (goal.level !== "individual") continue;
      const bucket = bySeller.get(goal.targetId) ?? [];
      bucket.push(progress.percentage);
      bySeller.set(goal.targetId, bucket);
    }
    const rows: IPoint[] = [];
    for (const [sellerId, list] of bySeller) {
      const average = list.length > 0 ? list.reduce((a, b) => a + b, 0) / list.length : 0;
      rows.push({
        sellerName: sellerNames.get(sellerId) ?? sellerId,
        averagePct: Math.round(average),
      });
    }
    return rows.sort((a, b) => b.averagePct - a.averagePct);
  }, [items, sellerNames]);

  return (
    <Card className="flex flex-col gap-4 p-5">
      <header className="flex items-baseline justify-between">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            Progresso por vendedor
          </h2>
          <p className="text-xs text-muted-foreground">
            Média do atingimento das metas individuais ativas.
          </p>
        </div>
        <Icon icon="mdi:chart-bar" size={20} className="text-muted-foreground" />
      </header>
      {isLoading ? (
        <Skeleton className="h-56 w-full" />
      ) : data.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Sem metas individuais ativas.
        </p>
      ) : (
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
              <XAxis
                dataKey="sellerName"
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                stroke="var(--border)"
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v: number) => `${v}%`}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                stroke="var(--border)"
                tickLine={false}
                width={48}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--popover)",
                  color: "var(--popover-foreground)",
                  fontSize: 12,
                }}
                formatter={(value: number) => [`${value}%`, "Média de atingimento"]}
              />
              <Bar dataKey="averagePct" radius={[4, 4, 0, 0]}>
                {data.map((entry) => (
                  <Cell key={entry.sellerName} fill={colorFor(entry.averagePct)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
