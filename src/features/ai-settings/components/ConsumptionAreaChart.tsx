import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { IAiUsageSummary } from "@/shared/types";

interface Props {
  series: IAiUsageSummary["series"];
  metric: "calls" | "tokens" | "costBRL";
}

export function ConsumptionAreaChart({ series, metric }: Props) {
  const data = series.map((p) => ({ date: p.date.slice(5), value: p[metric] }));
  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
          stroke="var(--border)"
          minTickGap={24}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
          stroke="var(--border)"
          width={42}
        />
        <Tooltip
          contentStyle={{
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--popover)",
            fontSize: 12,
          }}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke="var(--primary)"
          fill="var(--primary)"
          fillOpacity={0.16}
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
