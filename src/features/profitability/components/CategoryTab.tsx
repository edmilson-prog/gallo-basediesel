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
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { formatBRL, formatPercent } from "@/shared/utils/format";
import { HealthBadge } from "./HealthBadge";
import { PROFITABILITY_STRINGS as S } from "../i18n/pt-BR";
import type { ICategoryProfitabilityRow } from "../engine";

const CATEGORY_LABELS: Record<string, string> = {
  filtro: "Filtros",
  freio: "Freios",
  correia: "Correias",
  motor: "Motor",
  embreagem: "Embreagem",
  eletrica: "Elétrica",
  transmissao: "Transmissão",
  suspensao: "Suspensão",
  arrefecimento: "Arrefecimento",
  lubrificante: "Lubrificantes",
  outros: "Outros",
};

const COLOR_BY_HEALTH: Record<string, string> = {
  good: "var(--gallo-success-medium, #10b981)",
  neutral: "var(--gallo-industrial-yellow, #C79C2C)",
  warning: "var(--gallo-warning-medium, #f59e0b)",
  critical: "var(--gallo-danger-medium, #ef4444)",
};

export interface ICategoryTabProps {
  rows: ICategoryProfitabilityRow[];
  rowsPrevious: ICategoryProfitabilityRow[];
}

export function CategoryTab({ rows, rowsPrevious }: ICategoryTabProps) {
  const sorted = useMemo(() => [...rows].sort((a, b) => b.margin - a.margin), [rows]);

  const prevByCategory = useMemo(() => {
    const map = new Map<string, ICategoryProfitabilityRow>();
    for (const row of rowsPrevious) map.set(row.category, row);
    return map;
  }, [rowsPrevious]);

  const chartData = useMemo(
    () =>
      sorted.map((row) => ({
        category: row.category,
        label: CATEGORY_LABELS[row.category] ?? row.category,
        marginPct: row.marginPct,
        margin: row.margin,
        health: row.health,
      })),
    [sorted],
  );

  return (
    <div className="space-y-5">
      <Card className="flex flex-col gap-4 p-5">
        <header className="flex items-baseline justify-between">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-foreground">
              {S.categoryChartTitle}
            </h2>
            <p className="text-xs text-muted-foreground">{S.categoryChartHelp}</p>
          </div>
          <Icon icon="mdi:chart-bar" size={20} className="text-muted-foreground" />
        </header>
        {chartData.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{S.categoryEmpty}</p>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  stroke="var(--border)"
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
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
                  formatter={(value: number, _name, props) => [
                    `${(value * 100).toFixed(1)}% — ${formatBRL(props.payload.margin)}`,
                    "Margem",
                  ]}
                  labelFormatter={(value: string) => value}
                />
                <Bar dataKey="marginPct" radius={[6, 6, 0, 0]}>
                  {chartData.map((entry) => (
                    <Cell
                      key={entry.category}
                      fill={COLOR_BY_HEALTH[entry.health] ?? "var(--primary)"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 text-left font-medium">Categoria</th>
                <th className="px-4 py-3 text-right font-medium">Produtos</th>
                <th className="px-4 py-3 text-right font-medium">{S.tableRevenue}</th>
                <th className="px-4 py-3 text-right font-medium">{S.tableCost}</th>
                <th className="px-4 py-3 text-right font-medium">{S.tableMargin}</th>
                <th className="px-4 py-3 text-right font-medium">{S.tableMarginPct}</th>
                <th className="px-4 py-3 text-right font-medium">Δ vs mês anterior</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => {
                const prev = prevByCategory.get(row.category);
                const deltaPct =
                  prev && prev.marginPct !== 0
                    ? (row.marginPct - prev.marginPct) / Math.abs(prev.marginPct)
                    : null;
                return (
                  <tr
                    key={row.category}
                    className="border-b border-border/60 last:border-b-0 hover:bg-accent/20"
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <HealthBadge health={row.health} compact />
                        <span className="font-medium text-foreground">
                          {CATEGORY_LABELS[row.category] ?? row.category}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                      {row.productCount}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {formatBRL(row.revenue)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                      {formatBRL(row.cost)}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-2.5 text-right tabular-nums font-semibold",
                        row.margin < 0 && "text-destructive",
                      )}
                    >
                      {formatBRL(row.margin)}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-2.5 text-right tabular-nums",
                        row.marginPct < 0 && "text-destructive",
                      )}
                    >
                      {formatPercent(row.marginPct)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {deltaPct == null ? (
                        <span className="text-xs text-muted-foreground">{S.trendFlat}</span>
                      ) : (
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 text-xs font-medium",
                            deltaPct > 0 && "text-success",
                            deltaPct < 0 && "text-destructive",
                          )}
                        >
                          {deltaPct > 0 ? S.trendUp : deltaPct < 0 ? S.trendDown : S.trendFlat}
                          {(deltaPct * 100).toFixed(0)}%
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                    {S.categoryEmpty}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
