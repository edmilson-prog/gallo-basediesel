import { Link } from "@tanstack/react-router";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import { formatPercent } from "@/shared/utils/format";
import type { ID } from "@/shared/types";
import { resolvePortfolioWindow, DEFAULT_PORTFOLIO_FILTERS } from "../hooks/usePortfolioFilters";
import { usePortfolioMetrics } from "../hooks/usePortfolioMetrics";
import { PORTFOLIO_STRINGS as S } from "../i18n/pt-BR";

export interface IPortfolioHealthWidgetProps {
  storeId?: ID;
  sellerId?: ID;
}

const STATUS_COLORS = {
  ativo: "#10b981",
  recuperacao: "#3b82f6",
  dormente: "#f59e0b",
  perdido: "#ef4444",
} as const;

/**
 * Compact portfolio-health widget for the Manager Dashboard (PRD-014 integration).
 * Mini donut + churn / recovery counters. Links to the dedicated page
 * (`/app/gestao/carteira-analitica`).
 */
export function PortfolioHealthWidget({ storeId, sellerId }: IPortfolioHealthWidgetProps) {
  const window = resolvePortfolioWindow(DEFAULT_PORTFOLIO_FILTERS);
  const { metrics, isLoading } = usePortfolioMetrics({
    window,
    scope: { storeId, sellerId },
  });

  const total = metrics?.totalCustomers ?? 0;
  const empty = !isLoading && total === 0;
  const churn = (metrics?.churn.activeToDormant ?? 0) + (metrics?.churn.activeToLost ?? 0);
  const recovery =
    (metrics?.recovery.dormantToActive ?? 0) + (metrics?.recovery.lostToActive ?? 0);
  const activePct = total > 0 ? (metrics?.byStatus.ativo ?? 0) / total : 0;
  const data = metrics
    ? [
        { key: "ativo", value: metrics.byStatus.ativo, color: STATUS_COLORS.ativo },
        { key: "recuperacao", value: metrics.byStatus.recuperacao, color: STATUS_COLORS.recuperacao },
        { key: "dormente", value: metrics.byStatus.dormente, color: STATUS_COLORS.dormente },
        { key: "perdido", value: metrics.byStatus.perdido, color: STATUS_COLORS.perdido },
      ].filter((d) => d.value > 0)
    : [];

  return (
    <Card className="flex h-full flex-col gap-3 p-5">
      <header className="flex items-baseline justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground">
          <Icon icon="mdi:heart-pulse" size={18} className="text-primary" />
          {S.widgetTitle}
        </h2>
        <Link to="/app/gestao/carteira-analitica" className="text-xs text-primary hover:underline">
          {S.widgetOpen}
        </Link>
      </header>
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-4 w-40" />
        </div>
      ) : empty ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{S.widgetEmpty}</p>
      ) : (
        <div className="grid grid-cols-[110px_1fr] items-center gap-3">
          <div className="h-24 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  innerRadius={28}
                  outerRadius={42}
                  paddingAngle={2}
                  dataKey="value"
                  nameKey="key"
                  isAnimationActive={false}
                >
                  {data.map((entry) => (
                    <Cell key={entry.key} fill={entry.color} stroke="var(--background)" />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-col gap-1.5 text-xs">
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-semibold tracking-tight text-foreground">
                {formatPercent(activePct)}
              </span>
              <span className="text-muted-foreground">{S.widgetSubtitle(metrics?.byStatus.ativo ?? 0, total)}</span>
            </div>
            <div className="flex items-center gap-3 text-[11px]">
              <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
                <Icon icon="mdi:trending-down" size={12} />
                Churn {churn.toLocaleString("pt-BR")}
              </span>
              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <Icon icon="mdi:trending-up" size={12} />
                Recup. {recovery.toLocaleString("pt-BR")}
              </span>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
