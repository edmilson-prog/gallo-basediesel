import {
  CartesianGrid,
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
import { formatBRL, formatBRLCompact } from "@/shared/utils/format";
import { formatMonthKey } from "../../utils/seasonality";
import type { IRevenueMonthlyPoint } from "../../hooks/useSalesAnalytics";
import { SALES_ANALYTICS_STRINGS as S } from "../../i18n/pt-BR";

export interface IRevenueOverTimeChartProps {
  data: IRevenueMonthlyPoint[];
  isLoading?: boolean;
}

function tickFormatter(value: string): string {
  // Short YYYY-MM → MM/YY for ticks
  const [year, month] = value.split("-");
  return `${month}/${year.slice(2)}`;
}

export function RevenueOverTimeChart({ data, isLoading }: IRevenueOverTimeChartProps) {
  const empty = !isLoading && data.every((p) => p.revenue === 0);

  return (
    <Card className="flex h-full flex-col gap-4 p-5">
      <header className="flex items-baseline justify-between">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            {S.chartRevenueOverTime}
          </h2>
          <p className="text-xs text-muted-foreground">{S.chartRevenueOverTimeHelp}</p>
        </div>
        <Icon icon="mdi:chart-line" size={20} className="text-muted-foreground" />
      </header>
      {isLoading ? (
        <Skeleton className="h-56 w-full" />
      ) : empty ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{S.chartEmpty}</p>
      ) : (
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
              <XAxis
                dataKey="monthKey"
                tickFormatter={tickFormatter}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                stroke="var(--border)"
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v: number) => formatBRLCompact(v)}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                stroke="var(--border)"
                tickLine={false}
                width={64}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--popover)",
                  color: "var(--popover-foreground)",
                  fontSize: 12,
                }}
                labelFormatter={(v: string) => formatMonthKey(v)}
                formatter={(value: number) => [formatBRL(value), S.kpiRevenue]}
              />
              <Line
                type="monotone"
                dataKey="revenue"
                stroke="var(--primary)"
                strokeWidth={2}
                dot={{ r: 3, fill: "var(--primary)" }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
