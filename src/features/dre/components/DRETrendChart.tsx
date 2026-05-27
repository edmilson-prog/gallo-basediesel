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
import type { IDRETrendPoint } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import { formatBRL, formatBRLCompact } from "@/shared/utils/format";
import { DRE_STRINGS as S } from "../i18n/pt-BR";

export interface IDRETrendChartProps {
  data: IDRETrendPoint[];
}

function tickFormatter(value: string): string {
  const [year, month] = value.split("-");
  return `${month}/${year.slice(2)}`;
}

export function DRETrendChart({ data }: IDRETrendChartProps) {
  const empty =
    data.length === 0 || data.every((p) => p.revenue === 0 && p.costs === 0 && p.netResult === 0);
  return (
    <Card className="flex h-full flex-col gap-4 p-5">
      <header className="flex items-baseline justify-between">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            {S.chartTrendTitle}
          </h2>
          <p className="text-xs text-muted-foreground">{S.chartTrendHelp}</p>
        </div>
        <Icon icon="mdi:chart-line" size={20} className="text-muted-foreground" />
      </header>
      {empty ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{S.chartTrendEmpty}</p>
      ) : (
        <div className="h-64 w-full">
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
                labelFormatter={(_v, payload) => payload?.[0]?.payload.monthLabel ?? ""}
                formatter={(value: number, name: string) => [formatBRL(value), name]}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, color: "var(--muted-foreground)" }}
                iconSize={10}
              />
              <Line
                type="monotone"
                dataKey="revenue"
                name={S.chartTrendLegendRevenue}
                stroke="var(--gallo-parts-green, #337648)"
                strokeWidth={2}
                dot={{ r: 2.5 }}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="costs"
                name={S.chartTrendLegendCosts}
                stroke="var(--gallo-service-red, #C4151C)"
                strokeWidth={2}
                dot={{ r: 2.5 }}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="netResult"
                name={S.chartTrendLegendNet}
                stroke="var(--primary)"
                strokeWidth={2.5}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
