import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { IInventoryAnalysis, IInventoryMetrics, InventoryStatus } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/shared/utils/format";
import { InventoryStatusBadge, InventoryCurveBadge } from "./InventoryStatusBadge";
import { INVENTORY_STRINGS as S } from "../i18n/pt-BR";

const STATUS_COLORS: Record<InventoryStatus, string> = {
  ok: "var(--gallo-success-medium, #10b981)",
  baixo: "var(--gallo-warning-medium, #f59e0b)",
  critico: "var(--gallo-danger-medium, #ef4444)",
  excesso: "var(--gallo-info-medium, #3b82f6)",
};

const STATUS_LABELS: Record<InventoryStatus, string> = {
  ok: S.statusOk,
  baixo: S.statusBaixo,
  critico: S.statusCritico,
  excesso: S.statusExcesso,
};

const URGENCY_ORDER: Record<InventoryStatus, number> = {
  critico: 0,
  baixo: 1,
  excesso: 2,
  ok: 3,
};

const KpiCard = ({
  label,
  value,
  helper,
  icon,
  tone,
}: {
  label: string;
  value: string;
  helper?: string;
  icon: string;
  tone?: "neutral" | "warning" | "critical" | "info";
}) => (
  <Card className="flex flex-col gap-1.5 p-4">
    <div className="flex items-baseline justify-between">
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <Icon
        icon={icon}
        size={16}
        className={cn(
          "text-muted-foreground",
          tone === "warning" && "text-warning",
          tone === "critical" && "text-destructive",
          tone === "info" && "text-info",
        )}
      />
    </div>
    <span className="text-2xl font-semibold tabular-nums text-foreground">{value}</span>
    {helper && <span className="text-xs text-muted-foreground">{helper}</span>}
  </Card>
);

export interface IOverviewTabProps {
  metrics: IInventoryMetrics;
  analyses: IInventoryAnalysis[];
}

export function OverviewTab({ metrics, analyses }: IOverviewTabProps) {
  const navigate = useNavigate();

  const chartData = useMemo(() => {
    return (Object.keys(metrics.byStatus) as InventoryStatus[])
      .filter((status) => metrics.byStatus[status] > 0)
      .map((status) => ({
        status,
        label: STATUS_LABELS[status],
        value: metrics.byStatus[status],
      }));
  }, [metrics.byStatus]);

  const topByUrgency = useMemo(() => {
    return [...analyses]
      .sort((a, b) => {
        const diff = URGENCY_ORDER[a.status] - URGENCY_ORDER[b.status];
        if (diff !== 0) return diff;
        return b.consumptionLastWindow - a.consumptionLastWindow;
      })
      .slice(0, 20);
  }, [analyses]);

  const empty = chartData.length === 0;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          label={S.kpiTotal}
          value={String(metrics.totalProducts)}
          icon="mdi:package-variant-closed"
        />
        <KpiCard
          label={S.kpiOk}
          value={String(metrics.byStatus.ok)}
          icon="mdi:check-circle-outline"
          tone="neutral"
        />
        <KpiCard
          label={S.kpiBaixo}
          value={`${metrics.byStatus.baixo} / ${metrics.byStatus.critico}`}
          helper={`${metrics.byStatus.baixo} baixos · ${metrics.byStatus.critico} críticos`}
          icon="mdi:alert-octagon-outline"
          tone={metrics.byStatus.critico > 0 ? "critical" : "warning"}
        />
        <KpiCard
          label={S.kpiCapital}
          value={formatBRL(metrics.totalCapitalTied)}
          icon="mdi:cash-lock"
        />
        <KpiCard
          label={S.kpiCapitalExcess}
          value={formatBRL(metrics.capitalInExcess)}
          helper={`${metrics.byStatus.excesso} produtos`}
          icon="mdi:scale-unbalanced"
          tone={metrics.capitalInExcess > 0 ? "info" : "neutral"}
        />
      </div>

      <section className="grid gap-4 lg:grid-cols-[1fr_1.5fr]">
        <Card className="flex flex-col gap-4 p-5">
          <header className="flex items-baseline justify-between">
            <h2 className="text-base font-semibold tracking-tight text-foreground">
              {S.distributionTitle}
            </h2>
            <Icon icon="mdi:chart-donut" size={20} className="text-muted-foreground" />
          </header>
          {empty ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{S.distributionEmpty}</p>
          ) : (
            <div className="flex h-56 items-center gap-4">
              <ResponsiveContainer width="55%" height="100%">
                <PieChart>
                  <Tooltip
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      background: "var(--popover)",
                      color: "var(--popover-foreground)",
                      fontSize: 12,
                    }}
                    formatter={(value: number, _name, props) => [`${value}`, props.payload.label]}
                  />
                  <Pie
                    data={chartData}
                    dataKey="value"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    innerRadius={36}
                    outerRadius={70}
                    paddingAngle={2}
                  >
                    {chartData.map((entry) => (
                      <Cell key={entry.status} fill={STATUS_COLORS[entry.status]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <ul className="flex flex-1 flex-col gap-2 text-xs">
                {chartData.map((entry) => (
                  <li key={entry.status} className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: STATUS_COLORS[entry.status] }}
                      aria-hidden="true"
                    />
                    <span className="flex-1 text-foreground">{entry.label}</span>
                    <span className="font-medium text-muted-foreground">{entry.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <Card className="overflow-hidden p-0">
          <header className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">{S.overviewTableTitle}</h2>
            <span className="text-xs text-muted-foreground">{topByUrgency.length} produtos</span>
          </header>
          {topByUrgency.length === 0 ? (
            <p className="p-10 text-center text-sm text-muted-foreground">{S.overviewEmpty}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-2 text-left font-medium">Produto</th>
                    <th className="px-4 py-2 text-right font-medium">Estoque</th>
                    <th className="px-4 py-2 text-right font-medium">Cobertura</th>
                    <th className="px-4 py-2 text-center font-medium">Curva</th>
                    <th className="px-4 py-2 text-center font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {topByUrgency.map((row) => (
                    <tr
                      key={row.partId}
                      className="cursor-pointer border-b border-border/60 last:border-b-0 hover:bg-accent/40"
                      onClick={() =>
                        void navigate({ to: "/app/catalogo/$id", params: { id: row.partId } })
                      }
                    >
                      <td className="px-4 py-2">
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">{row.partName}</span>
                          <span className="text-xs text-muted-foreground">{row.partSku}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{row.stockQuantity}</td>
                      <td
                        className={cn(
                          "px-4 py-2 text-right tabular-nums",
                          row.coverageInDays < 15 && "text-destructive",
                        )}
                      >
                        {Number.isFinite(row.coverageInDays)
                          ? `${row.coverageInDays.toFixed(1)} d`
                          : "∞"}
                      </td>
                      <td className="px-4 py-2 text-center">
                        <InventoryCurveBadge curve={row.curve} />
                      </td>
                      <td className="px-4 py-2 text-center">
                        <InventoryStatusBadge status={row.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}
