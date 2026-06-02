import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import { EmptyState } from "@/features/shell/components/EmptyState";
import { ListStatStrip } from "@/shared/list-views";
import type { IStatCell } from "@/shared/list-views";
import { useSellersProvider } from "@/providers/data";
import type { ID, ISeller } from "@/shared/types";
import { useStoreIndicators } from "../hooks/useIndicators";
import { useIndicatorFilters } from "../hooks/useIndicatorFilters";
import { applyFilters } from "../hooks/useIndicatorFilters";
import { indicatorsPtBR as S } from "../i18n/pt-BR";
import { IndicatorFiltersBar } from "./IndicatorFiltersBar";
import { IndicatorProgressChart } from "./IndicatorProgressChart";
import { IndicatorsTable } from "./IndicatorsTable";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AggregatedIndicatorsDashboard({
  storeId,
  canCreate,
}: {
  storeId: ID;
  canCreate: boolean;
}) {
  const { items, isLoading, hasError, refetch } = useStoreIndicators(storeId);
  const sellersProvider = useSellersProvider();
  const [sellers, setSellers] = useState<ISeller[]>([]);
  const { filters, setFilter, resetFilters, activeCount } = useIndicatorFilters();

  useEffect(() => {
    let cancelled = false;
    void sellersProvider.list({ storeId }).then((list) => {
      if (!cancelled) setSellers(list);
    });
    return () => {
      cancelled = true;
    };
  }, [sellersProvider, storeId]);

  const sellerNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of sellers) map.set(s.id, s.fullName);
    return map;
  }, [sellers]);

  const activeItems = useMemo(
    () => items.filter(({ indicator }) => indicator.status === "ativo"),
    [items],
  );

  const kpiCells = useMemo<IStatCell[]>(() => {
    const count = activeItems.length;
    const avgPct =
      count > 0
        ? Math.round(
            activeItems.reduce((acc, { progress }) => acc + progress.percentage, 0) / count,
          )
        : 0;
    const above = activeItems.filter(({ progress }) => progress.percentage >= 100).length;
    const behind = activeItems.filter(({ progress }) => progress.status === "atrasada").length;
    return [
      {
        icon: "mdi:chart-line",
        label: S.kpis.active,
        value: count.toLocaleString("pt-BR"),
        tone: "default" as const,
      },
      {
        icon: "mdi:percent-outline",
        label: S.kpis.avgAttainment,
        value: `${avgPct}%`,
        tone: avgPct >= 100 ? ("good" as const) : avgPct >= 70 ? ("warn" as const) : ("bad" as const),
      },
      {
        icon: "mdi:trophy-outline",
        label: S.kpis.above,
        value: above.toLocaleString("pt-BR"),
        tone: above > 0 ? ("good" as const) : ("default" as const),
      },
      {
        icon: "mdi:alert-circle-outline",
        label: S.kpis.behind,
        value: behind.toLocaleString("pt-BR"),
        tone: behind > 0 ? ("bad" as const) : ("default" as const),
      },
    ];
  }, [activeItems]);

  const filteredItems = useMemo(() => applyFilters(items, filters), [items, filters]);

  if (hasError) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-muted-foreground">
        <Icon icon="mdi:alert-circle-outline" size={40} />
        <p className="text-sm">Erro ao carregar indicadores.</p>
        <Button variant="outline" size="sm" onClick={refetch}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
            <Icon icon="mdi:chart-line" size={26} className="text-primary" />
            {S.title}
          </h1>
          <p className="text-sm text-muted-foreground">{S.subtitle}</p>
        </div>

        {canCreate && (
          <Button asChild size="sm" className="gap-1">
            <Link to="/app/gestao/indicadores/novo">
              <Icon icon="mdi:plus" size={16} />
              {S.new}
            </Link>
          </Button>
        )}
      </header>

      {/* KPI strip */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <ListStatStrip cells={kpiCells} />
      )}

      {/* Filters */}
      <IndicatorFiltersBar
        filters={filters}
        onSelectorKind={(v) => setFilter("selectorKind", v)}
        onMetric={(v) => setFilter("metric", v)}
        onScopeLevel={(v) => setFilter("scopeLevel", v)}
        onStatus={(v) => setFilter("status", v)}
        onReset={resetFilters}
        activeCount={activeCount}
      />

      {/* Chart */}
      <IndicatorProgressChart items={filteredItems} isLoading={isLoading} />

      {/* Table */}
      {items.length === 0 && !isLoading ? (
        <EmptyState
          icon="mdi:chart-line"
          title={S.empty}
          description={S.emptyHint}
          actionLabel={canCreate ? S.new : undefined}
          actionTo={canCreate ? "/app/gestao/indicadores/novo" : undefined}
        />
      ) : (
        <IndicatorsTable
          rows={filteredItems}
          isLoading={isLoading}
          sellerNames={sellerNames}
        />
      )}
    </div>
  );
}
