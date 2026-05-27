import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import { formatBRL, formatBRLCompact, formatPercent } from "@/shared/utils/format";
import type { ICustomerABCRecord } from "../engine/classifyABC";
import { displayCustomerName } from "../utils/displayCustomerName";
import { ABC_STRINGS as S } from "../i18n/pt-BR";

export interface IParetoChartProps {
  records: ICustomerABCRecord[];
  classAThreshold: number;
  classBThreshold: number;
  isLoading?: boolean;
}

const CLASS_FILL = {
  A: "var(--gallo-parts-green, #337648)",
  B: "var(--gallo-industrial-yellow, #C79C2C)",
  C: "var(--gallo-service-red, #C4151C)",
} as const;

const MAX_BARS = 40;

export function ParetoChart({
  records,
  classAThreshold,
  classBThreshold,
  isLoading,
}: IParetoChartProps) {
  const empty = !isLoading && records.length === 0;
  // Cap to first N customers to keep the X axis legible — Pareto is most useful
  // on the head of the distribution anyway.
  const data = records.slice(0, MAX_BARS).map((r) => ({
    rank: r.rank,
    name: displayCustomerName(r.customer),
    revenue: r.revenue,
    cumulative: Math.round(r.cumulativeRevenuePct * 1000) / 10, // percent 0..100
    class: r.class,
  }));

  // Reference lines mark where each class cutoff falls. The Y is on the line axis.
  const aPct = Math.round(classAThreshold * 100);
  const bPct = Math.round(classBThreshold * 100);

  return (
    <Card className="flex h-full flex-col gap-3 p-5">
      <header className="flex items-baseline justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground">
            <Icon icon="mdi:chart-bar" size={18} className="text-primary" />
            {S.chartTitle}
          </h2>
          <p className="text-xs text-muted-foreground">{S.chartSubtitle}</p>
        </div>
      </header>
      {isLoading ? (
        <Skeleton className="h-72 w-full" />
      ) : empty ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{S.chartEmpty}</p>
      ) : (
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
              <XAxis
                dataKey="rank"
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                stroke="var(--border)"
                tickLine={false}
              />
              <YAxis
                yAxisId="left"
                tickFormatter={(v: number) => formatBRLCompact(v)}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                stroke="var(--border)"
                tickLine={false}
                width={64}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                domain={[0, 100]}
                tickFormatter={(v: number) => `${v}%`}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                stroke="var(--border)"
                tickLine={false}
                width={40}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--popover)",
                  color: "var(--popover-foreground)",
                  fontSize: 12,
                }}
                labelFormatter={(rank: number) => {
                  const row = data.find((d) => d.rank === rank);
                  return row ? `#${rank} — ${row.name}` : `#${rank}`;
                }}
                formatter={(value: number, name: string) => {
                  if (name === "revenue") return [formatBRL(value), S.chartBarRevenue];
                  return [`${value}%`, S.chartLineCumulative];
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, color: "var(--muted-foreground)" }}
                formatter={(v) => (v === "revenue" ? S.chartBarRevenue : S.chartLineCumulative)}
              />
              <ReferenceLine
                yAxisId="right"
                y={aPct}
                stroke="var(--gallo-parts-green, #337648)"
                strokeDasharray="4 4"
                label={{
                  value: `${S.chartCutoffA} (${aPct}%)`,
                  position: "right",
                  fontSize: 10,
                  fill: "var(--muted-foreground)",
                }}
              />
              <ReferenceLine
                yAxisId="right"
                y={bPct}
                stroke="var(--gallo-industrial-yellow, #C79C2C)"
                strokeDasharray="4 4"
                label={{
                  value: `${S.chartCutoffB} (${bPct}%)`,
                  position: "right",
                  fontSize: 10,
                  fill: "var(--muted-foreground)",
                }}
              />
              <Bar yAxisId="left" dataKey="revenue" radius={[4, 4, 0, 0]}>
                {data.map((entry) => (
                  <Cell key={entry.rank} fill={CLASS_FILL[entry.class]} />
                ))}
              </Bar>
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="cumulative"
                stroke="var(--primary)"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
      {!isLoading && records.length > MAX_BARS && (
        <p className="text-[11px] text-muted-foreground">
          Mostrando os primeiros {MAX_BARS} de {records.length.toLocaleString("pt-BR")} clientes —{" "}
          {formatPercent(records[MAX_BARS - 1]?.cumulativeRevenuePct ?? 0)} da receita.
        </p>
      )}
    </Card>
  );
}
