import { useMemo } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ICashFlowSummary } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import { formatBRL, formatBRLCompact, formatDateBR } from "@/shared/utils/format";
import { CASHFLOW_STRINGS as S } from "../i18n/pt-BR";

interface IChartPoint {
  date: string;
  label: string;
  inflow: number;
  outflow: number;
  balanceRealized: number | null;
  balanceProjected: number | null;
}

export function CashFlowChart({
  summary,
  minBalance,
}: {
  summary: ICashFlowSummary;
  minBalance: number;
}) {
  const data = useMemo<IChartPoint[]>(() => {
    const points = summary.dailyBalances;
    return points.map((p, i): IChartPoint => {
      const next = points[i + 1];
      const isBoundary = !p.isProjection && next?.isProjection;
      return {
        date: p.date,
        label: formatDateBR(p.date),
        inflow: p.inflow,
        outflow: -p.outflow,
        // Solid line on realized days; the boundary day also seeds the dashed
        // series so the two lines connect.
        balanceRealized: p.isProjection ? null : p.balance,
        balanceProjected: p.isProjection || isBoundary ? p.balance : null,
      };
    });
  }, [summary.dailyBalances]);

  return (
    <Card className="flex flex-col gap-4 p-5">
      <header className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold tracking-tight text-foreground">{S.chartTitle}</h2>
        <Icon icon="mdi:chart-areaspline" size={20} className="text-muted-foreground" />
      </header>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              stroke="var(--border)"
              tickLine={false}
              minTickGap={24}
            />
            <YAxis
              tickFormatter={(v: number) => formatBRLCompact(v)}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              stroke="var(--border)"
              tickLine={false}
              width={70}
            />
            <Tooltip
              contentStyle={{
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--popover)",
                color: "var(--popover-foreground)",
                fontSize: 12,
              }}
              formatter={(value: number, name: string) => [formatBRL(Math.abs(value)), name]}
            />
            <Legend
              wrapperStyle={{ fontSize: 11, color: "var(--muted-foreground)" }}
              iconSize={10}
            />
            <ReferenceLine
              y={minBalance}
              stroke="var(--warning)"
              strokeDasharray="4 4"
              label={{
                value: S.chartMinBalance,
                position: "insideTopRight",
                fontSize: 10,
                fill: "var(--warning)",
              }}
            />
            <ReferenceLine y={0} stroke="var(--border)" />
            <Bar
              dataKey="inflow"
              name={S.chartInflow}
              fill="var(--gallo-parts-green, #337648)"
              radius={[2, 2, 0, 0]}
            />
            <Bar
              dataKey="outflow"
              name={S.chartOutflow}
              fill="var(--gallo-service-red, #C4151C)"
              radius={[0, 0, 2, 2]}
            />
            <Line
              type="monotone"
              dataKey="balanceRealized"
              name={`${S.chartBalance} (${S.chartRealized})`}
              stroke="var(--primary)"
              strokeWidth={2.5}
              dot={false}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="balanceProjected"
              name={`${S.chartBalance} (${S.chartProjected})`}
              stroke="var(--primary)"
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={false}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
