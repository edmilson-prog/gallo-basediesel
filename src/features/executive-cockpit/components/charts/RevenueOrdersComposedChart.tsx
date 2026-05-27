import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import { formatBRL, formatBRLCompact } from "@/shared/utils/format";
import type { IRevenueOrdersPoint } from "../../hooks/useCockpitMetrics";
import { EXECUTIVE_COCKPIT_STRINGS as S } from "../../i18n/pt-BR";

export interface IRevenueOrdersComposedChartProps {
  data: IRevenueOrdersPoint[];
  isLoading?: boolean;
  onClick?: () => void;
}

const MONTH_LABELS = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

function tickFormatter(value: string): string {
  const [year, month] = value.split("-");
  const idx = Math.max(0, Math.min(11, Number(month) - 1));
  return `${MONTH_LABELS[idx]}/${year.slice(2)}`;
}

function fullMonth(value: string): string {
  const [year, month] = value.split("-");
  const idx = Math.max(0, Math.min(11, Number(month) - 1));
  return `${MONTH_LABELS[idx].toUpperCase()} ${year}`;
}

export function RevenueOrdersComposedChart({
  data,
  isLoading,
  onClick,
}: IRevenueOrdersComposedChartProps) {
  const empty = !isLoading && data.every((p) => p.revenue === 0 && p.orderCount === 0);
  const interactive = Boolean(onClick);
  return (
    <Card
      className={
        interactive
          ? "flex h-full cursor-pointer flex-col gap-4 p-5 transition-colors hover:border-primary/50 hover:shadow-md"
          : "flex h-full flex-col gap-4 p-5"
      }
      onClick={interactive ? onClick : undefined}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={(e) => {
        if (!interactive) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
    >
      <header className="flex items-baseline justify-between">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            {S.chartRevenueOrders}
          </h2>
          <p className="text-xs text-muted-foreground">{S.chartRevenueOrdersHelp}</p>
        </div>
        <Icon icon="mdi:chart-areaspline" size={20} className="text-muted-foreground" />
      </header>
      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : empty ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{S.chartEmpty}</p>
      ) : (
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
              <XAxis
                dataKey="monthKey"
                tickFormatter={tickFormatter}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
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
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                stroke="var(--border)"
                tickLine={false}
                width={32}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--popover)",
                  color: "var(--popover-foreground)",
                  fontSize: 12,
                }}
                labelFormatter={(v: string) => fullMonth(v)}
                formatter={(value: number, name: string) => {
                  if (name === "revenue") return [formatBRL(value), "Faturamento"];
                  return [value.toLocaleString("pt-BR"), "Pedidos"];
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, color: "var(--muted-foreground)" }}
                formatter={(v) => (v === "revenue" ? "Faturamento" : "Pedidos")}
              />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="revenue"
                stroke="var(--primary)"
                strokeWidth={2}
                fill="url(#revenueGradient)"
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="orderCount"
                stroke="var(--gallo-industrial-yellow, #C79C2C)"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
