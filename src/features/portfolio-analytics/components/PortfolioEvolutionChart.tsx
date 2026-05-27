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
import { PORTFOLIO_STRINGS as S } from "../i18n/pt-BR";
import type { IPortfolioEvolutionPoint } from "../hooks/usePortfolioMetrics";

export interface IPortfolioEvolutionChartProps {
  data: IPortfolioEvolutionPoint[];
  isLoading?: boolean;
}

const STATUS_COLORS = {
  ativo: "#10b981",
  dormente: "#f59e0b",
  perdido: "#ef4444",
} as const;

function shortBucket(value: string): string {
  const [year, month] = value.split("-");
  return `${month}/${year.slice(2)}`;
}

function fullBucket(value: string): string {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

export function PortfolioEvolutionChart({ data, isLoading }: IPortfolioEvolutionChartProps) {
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
            {S.evolutionLegendAtivo} · {S.evolutionLegendDormente} · {S.evolutionLegendPerdido}
          </p>
        </div>
      </header>
      {isLoading ? (
        <Skeleton className="h-72 w-full" />
      ) : empty ? (
        <p className="py-12 text-center text-sm text-muted-foreground">{S.evolutionEmpty}</p>
      ) : (
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
              <XAxis
                dataKey="bucket"
                tickFormatter={shortBucket}
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
                labelFormatter={(v: string) => fullBucket(v)}
                formatter={(value: number, name: string) => {
                  const labelMap: Record<string, string> = {
                    ativo: S.evolutionLegendAtivo,
                    dormente: S.evolutionLegendDormente,
                    perdido: S.evolutionLegendPerdido,
                  };
                  return [value.toLocaleString("pt-BR"), labelMap[name] ?? name];
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, color: "var(--muted-foreground)" }}
                formatter={(v: string) => {
                  const labelMap: Record<string, string> = {
                    ativo: S.evolutionLegendAtivo,
                    dormente: S.evolutionLegendDormente,
                    perdido: S.evolutionLegendPerdido,
                  };
                  return labelMap[v] ?? v;
                }}
              />
              <Line
                type="monotone"
                dataKey="ativo"
                stroke={STATUS_COLORS.ativo}
                strokeWidth={2.25}
                dot={{ r: 2 }}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="dormente"
                stroke={STATUS_COLORS.dormente}
                strokeWidth={2.25}
                dot={{ r: 2 }}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="perdido"
                stroke={STATUS_COLORS.perdido}
                strokeWidth={2.25}
                dot={{ r: 2 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
