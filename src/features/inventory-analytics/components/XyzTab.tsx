import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { IInventoryAnalysis, InventoryCurve } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { formatBRL, formatBRLCompact, formatPercent } from "@/shared/utils/format";
import { InventoryCurveBadge } from "./InventoryStatusBadge";
import { INVENTORY_STRINGS as S } from "../i18n/pt-BR";

export interface IXyzTabProps {
  rows: IInventoryAnalysis[];
}

const CURVE_TITLE: Record<InventoryCurve, string> = {
  X: S.xyzColumnX,
  Y: S.xyzColumnY,
  Z: S.xyzColumnZ,
};

const CURVE_COLOR: Record<InventoryCurve, string> = {
  X: "var(--gallo-success-medium, #10b981)",
  Y: "var(--gallo-warning-medium, #f59e0b)",
  Z: "var(--gallo-info-medium, #3b82f6)",
};

export function XyzTab({ rows }: IXyzTabProps) {
  const navigate = useNavigate();

  const grouped = useMemo(() => {
    const out: Record<InventoryCurve, IInventoryAnalysis[]> = { X: [], Y: [], Z: [] };
    for (const row of rows) out[row.curve].push(row);
    for (const curve of ["X", "Y", "Z"] as InventoryCurve[]) {
      out[curve].sort((a, b) => b.consumptionLastWindow - a.consumptionLastWindow);
    }
    return out;
  }, [rows]);

  const chartData = useMemo(() => {
    let totalRevenue = 0;
    let totalStockValue = 0;
    const byCurve: Record<InventoryCurve, { revenue: number; stockValue: number; count: number }> =
      {
        X: { revenue: 0, stockValue: 0, count: 0 },
        Y: { revenue: 0, stockValue: 0, count: 0 },
        Z: { revenue: 0, stockValue: 0, count: 0 },
      };
    for (const row of rows) {
      const revenue = row.consumptionLastWindow * row.unitPrice;
      byCurve[row.curve].revenue += revenue;
      byCurve[row.curve].stockValue += row.capitalTied;
      byCurve[row.curve].count += 1;
      totalRevenue += revenue;
      totalStockValue += row.capitalTied;
    }
    return (["X", "Y", "Z"] as InventoryCurve[]).map((curve) => ({
      curve,
      label: `${curve}`,
      count: byCurve[curve].count,
      revenuePct: totalRevenue > 0 ? byCurve[curve].revenue / totalRevenue : 0,
      stockPct: totalStockValue > 0 ? byCurve[curve].stockValue / totalStockValue : 0,
      revenue: byCurve[curve].revenue,
      stockValue: byCurve[curve].stockValue,
    }));
  }, [rows]);

  const totalsByCurve = chartData.reduce(
    (acc, item) => {
      acc[item.curve] = item;
      return acc;
    },
    {} as Record<InventoryCurve, (typeof chartData)[number]>,
  );

  return (
    <div className="space-y-5">
      <Card className="flex flex-col gap-4 p-5">
        <header className="flex items-baseline justify-between">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-foreground">
              {S.xyzChartTitle}
            </h2>
            <p className="text-xs text-muted-foreground">{S.xyzChartHelp}</p>
          </div>
          <Icon icon="mdi:chart-bar-stacked" size={20} className="text-muted-foreground" />
        </header>
        {rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{S.overviewEmpty}</p>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
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
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--popover)",
                    color: "var(--popover-foreground)",
                    fontSize: 12,
                  }}
                  formatter={(value: number, name) => [`${(value * 100).toFixed(1)}%`, name]}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11, color: "var(--muted-foreground)" }}
                  iconSize={10}
                />
                <Bar
                  dataKey="revenuePct"
                  name="Faturamento"
                  fill="var(--gallo-parts-green, #337648)"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="stockPct"
                  name="Estoque (capital)"
                  fill="var(--gallo-industrial-yellow, #C79C2C)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {(["X", "Y", "Z"] as InventoryCurve[]).map((curve) => {
          const items = grouped[curve];
          const stats = totalsByCurve[curve];
          return (
            <Card key={curve} className="flex h-full flex-col overflow-hidden p-0">
              <header className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <InventoryCurveBadge curve={curve} />
                    <h3 className="text-sm font-semibold text-foreground">{CURVE_TITLE[curve]}</h3>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {items.length} produtos · {formatPercent(stats.revenuePct)} do faturamento
                  </p>
                </div>
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: CURVE_COLOR[curve] }}
                />
              </header>
              {items.length === 0 ? (
                <p className="p-6 text-center text-xs text-muted-foreground">
                  Sem produtos nesta classe.
                </p>
              ) : (
                <ul className="divide-y divide-border/60 text-sm">
                  {items.slice(0, 10).map((row) => (
                    <li
                      key={row.partId}
                      className="cursor-pointer px-4 py-2 hover:bg-accent/40"
                      onClick={() =>
                        void navigate({ to: "/app/catalogo/$id", params: { id: row.partId } })
                      }
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate font-medium text-foreground">{row.partName}</span>
                        <span
                          className={cn(
                            "shrink-0 text-xs tabular-nums",
                            row.coverageInDays < 15 && "text-destructive",
                          )}
                        >
                          {Number.isFinite(row.coverageInDays)
                            ? `${row.coverageInDays.toFixed(0)} d`
                            : "∞"}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {row.consumptionLastWindow} consumo · {formatBRLCompact(row.capitalTied)}
                      </p>
                    </li>
                  ))}
                  {items.length > 10 && (
                    <li className="px-4 py-2 text-center text-xs text-muted-foreground">
                      +{items.length - 10} produtos
                    </li>
                  )}
                </ul>
              )}
              <footer className="border-t border-border bg-muted/20 px-4 py-2 text-xs text-muted-foreground">
                Capital amarrado: {formatBRL(stats.stockValue)}
              </footer>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
