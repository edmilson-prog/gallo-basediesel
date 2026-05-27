import { useMemo } from "react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import { formatPercent } from "@/shared/utils/format";
import { PORTFOLIO_STRINGS as S } from "../i18n/pt-BR";
import type { IPortfolioByStatus } from "../engine/calculatePortfolioMetrics";

export interface IPortfolioDistributionChartProps {
  byStatus: IPortfolioByStatus;
  isLoading?: boolean;
}

const STATUS_COLORS = {
  ativo: "#10b981",
  recuperacao: "#3b82f6",
  dormente: "#f59e0b",
  perdido: "#ef4444",
} as const;

export function PortfolioDistributionChart({
  byStatus,
  isLoading,
}: IPortfolioDistributionChartProps) {
  const data = useMemo(
    () =>
      [
        { key: "ativo", name: S.statusAtivo, value: byStatus.ativo, color: STATUS_COLORS.ativo },
        {
          key: "recuperacao",
          name: S.statusRecuperacao,
          value: byStatus.recuperacao,
          color: STATUS_COLORS.recuperacao,
        },
        {
          key: "dormente",
          name: S.statusDormente,
          value: byStatus.dormente,
          color: STATUS_COLORS.dormente,
        },
        {
          key: "perdido",
          name: S.statusPerdido,
          value: byStatus.perdido,
          color: STATUS_COLORS.perdido,
        },
      ].filter((entry) => entry.value > 0),
    [byStatus],
  );

  const total =
    byStatus.ativo + byStatus.dormente + byStatus.perdido + byStatus.recuperacao;
  const empty = !isLoading && total === 0;

  return (
    <Card className="flex h-full flex-col gap-3 p-5">
      <header className="flex items-baseline justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground">
          <Icon icon="mdi:chart-donut" size={18} className="text-primary" />
          {S.sectionDistribution}
        </h2>
      </header>
      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : empty ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{S.distributionEmpty}</p>
      ) : (
        <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-[1fr_auto]">
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--popover)",
                    color: "var(--popover-foreground)",
                    fontSize: 12,
                  }}
                  formatter={(value: number, name: string) => [
                    `${value.toLocaleString("pt-BR")} (${formatPercent(value / total)})`,
                    name,
                  ]}
                />
                <Legend
                  iconType="circle"
                  wrapperStyle={{ fontSize: 11, color: "var(--muted-foreground)" }}
                />
                <Pie
                  data={data}
                  innerRadius={48}
                  outerRadius={88}
                  paddingAngle={2}
                  dataKey="value"
                  nameKey="name"
                  isAnimationActive={false}
                >
                  {data.map((entry) => (
                    <Cell key={entry.key} fill={entry.color} stroke="var(--background)" />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-col gap-2 text-xs">
            {data.map((entry) => (
              <div key={entry.key} className="flex items-center gap-2">
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: entry.color }}
                  aria-hidden
                />
                <span className="text-muted-foreground">{entry.name}</span>
                <span className="font-semibold text-foreground">
                  {entry.value.toLocaleString("pt-BR")}
                </span>
                <span className="text-muted-foreground">({formatPercent(entry.value / total)})</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
