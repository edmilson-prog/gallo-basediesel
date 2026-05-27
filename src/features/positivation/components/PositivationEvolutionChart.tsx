import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import type { IPositivationDailyPoint } from "../hooks/usePositivationMetrics";
import { POSITIVATION_STRINGS as S } from "../i18n/pt-BR";

export interface IPositivationEvolutionChartProps {
  data: IPositivationDailyPoint[];
  isLoading?: boolean;
}

function shortDay(value: string): string {
  const [, month, day] = value.split("-");
  return `${day}/${month}`;
}

function fullDay(value: string): string {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

export function PositivationEvolutionChart({ data, isLoading }: IPositivationEvolutionChartProps) {
  const empty = !isLoading && data.length === 0;
  return (
    <Card className="flex h-full flex-col gap-3 p-5">
      <header className="flex items-baseline justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground">
            <Icon icon="mdi:chart-timeline-variant" size={18} className="text-primary" />
            {S.sectionEvolution}
          </h2>
          <p className="text-xs text-muted-foreground">
            {S.chartCumulative} vs {S.chartExpected}
          </p>
        </div>
      </header>
      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : empty ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{S.chartEmpty}</p>
      ) : (
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
              <XAxis
                dataKey="day"
                tickFormatter={shortDay}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                stroke="var(--border)"
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                stroke="var(--border)"
                tickLine={false}
                width={36}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--popover)",
                  color: "var(--popover-foreground)",
                  fontSize: 12,
                }}
                labelFormatter={(v: string) => fullDay(v)}
                formatter={(value: number, name: string) => {
                  if (Number.isNaN(value)) return ["—", name];
                  const label = name === "cumulative" ? S.chartCumulative : S.chartExpected;
                  return [value.toLocaleString("pt-BR"), label];
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, color: "var(--muted-foreground)" }}
                formatter={(v) => (v === "cumulative" ? S.chartCumulative : S.chartExpected)}
              />
              <Line
                type="monotone"
                dataKey="expected"
                stroke="var(--muted-foreground)"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="cumulative"
                stroke="var(--primary)"
                strokeWidth={2.25}
                dot={{ r: 2 }}
                isAnimationActive={false}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
