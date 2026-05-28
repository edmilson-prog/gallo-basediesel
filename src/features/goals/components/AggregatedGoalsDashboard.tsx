import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Icon } from "@/components/Icon";
import type { ID, ISeller } from "@/shared/types";
import { useSellersProvider } from "@/providers/data";
import { GOALS_STRINGS as S } from "../i18n/pt-BR";
import { useGoalsFilters } from "../hooks/useGoalsFilters";
import { useGoalsWithProgress } from "../hooks/useGoalsWithProgress";
import { useGoalsStatistics } from "../hooks/useGoalsStatistics";
import { useGoalAutoStatusUpdate } from "../hooks/useGoalAutoStatusUpdate";
import { GoalKpiRow } from "./GoalKpiRow";
import { GoalsFiltersBar } from "./GoalsFiltersBar";
import { GoalsTable } from "./GoalsTable";
import { SellerProgressBarChart } from "./SellerProgressBarChart";

export interface IAggregatedGoalsDashboardProps {
  storeId: ID;
  storeLocked: boolean;
  canCreate: boolean;
}

export function AggregatedGoalsDashboard({
  storeId,
  storeLocked,
  canCreate,
}: IAggregatedGoalsDashboardProps) {
  const filtersCtl = useGoalsFilters({ gestorLockedStoreId: storeLocked ? storeId : undefined });
  const { filters } = filtersCtl;

  // Auto-archive overdue goals on mount (Owner/Gestor view).
  useGoalAutoStatusUpdate({ storeId: storeLocked ? storeId : undefined });

  const sellersProvider = useSellersProvider();
  const [sellers, setSellers] = useState<ISeller[]>([]);

  useEffect(() => {
    let cancelled = false;
    void sellersProvider.list({ storeId: storeLocked ? storeId : undefined }).then((list) => {
      if (!cancelled) setSellers(list);
    });
    return () => {
      cancelled = true;
    };
  }, [sellersProvider, storeId, storeLocked]);

  const sellerNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of sellers) map.set(s.id, s.fullName);
    return map;
  }, [sellers]);

  const scopeStoreId = filters.store === "all" ? undefined : filters.store;
  const scopeSellerId = filters.seller === "all" ? undefined : filters.seller;

  const stats = useGoalsStatistics({ storeId: scopeStoreId, sellerId: scopeSellerId });

  const active = useGoalsWithProgress({
    storeId: scopeStoreId,
    sellerId: scopeSellerId,
    statuses: ["ativa"],
  });

  const history = useGoalsWithProgress({
    storeId: scopeStoreId,
    sellerId: scopeSellerId,
    statuses: ["concluida", "arquivada", "cancelada"],
  });

  const filteredActive = useMemo(() => {
    return active.items.filter(({ goal }) => {
      if (filters.type !== "all" && goal.metric !== filters.type) return false;
      if (filters.scope !== "all" && goal.level !== filters.scope) return false;
      if (filters.period !== "all" && goal.period.type !== filters.period) return false;
      if (filters.status !== "all" && (goal.status ?? "ativa") !== filters.status) return false;
      return true;
    });
  }, [active.items, filters]);

  const filteredHistory = useMemo(() => {
    return history.items.filter(({ goal }) => {
      if (filters.type !== "all" && goal.metric !== filters.type) return false;
      if (filters.scope !== "all" && goal.level !== filters.scope) return false;
      if (filters.period !== "all" && goal.period.type !== filters.period) return false;
      if (filters.status !== "all" && (goal.status ?? "arquivada") !== filters.status) return false;
      return true;
    });
  }, [history.items, filters]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
            <Icon icon="mdi:target" size={26} className="text-primary" />
            {S.pageTitle}
          </h1>
          <p className="text-sm text-muted-foreground">{S.pageSubtitle}</p>
        </div>

        {canCreate && (
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm" className="gap-1">
              <Link to="/app/gestao/metas/lote">
                <Icon icon="mdi:account-multiple-plus-outline" size={16} />
                {S.batchCta}
              </Link>
            </Button>
            <Button asChild size="sm" className="gap-1">
              <Link to="/app/gestao/metas/nova">
                <Icon icon="mdi:plus" size={16} />
                {S.createCta}
              </Link>
            </Button>
          </div>
        )}
      </header>

      <GoalKpiRow stats={stats} />

      <GoalsFiltersBar
        filters={filters}
        storeLocked={storeLocked}
        activeCount={filtersCtl.activeCount}
        onType={filtersCtl.setType}
        onScope={filtersCtl.setScope}
        onStatus={filtersCtl.setStatus}
        onSeller={filtersCtl.setSeller}
        onStore={filtersCtl.setStore}
        onPeriod={filtersCtl.setPeriod}
        onReset={filtersCtl.reset}
      />

      <Tabs
        value={filters.tab}
        onValueChange={(v) => filtersCtl.setTab(v as typeof filters.tab)}
        className="w-full"
      >
        <TabsList className="mb-4 flex h-auto w-full max-w-md gap-1 bg-muted/40 p-1">
          <TabsTrigger value="active" className="flex h-9 flex-1 items-center justify-center gap-2">
            <Icon icon="mdi:target" size={16} />
            {S.tabActive}
          </TabsTrigger>
          <TabsTrigger
            value="history"
            className="flex h-9 flex-1 items-center justify-center gap-2"
          >
            <Icon icon="mdi:history" size={16} />
            {S.tabHistory}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="focus-visible:outline-none">
          <div className="flex flex-col gap-4">
            <SellerProgressBarChart
              items={filteredActive}
              sellerNames={sellerNames}
              isLoading={active.isLoading}
            />
            <GoalsTable
              rows={filteredActive}
              isLoading={active.isLoading}
              sellerNames={sellerNames}
            />
          </div>
        </TabsContent>

        <TabsContent value="history" className="focus-visible:outline-none">
          <GoalsTable
            rows={filteredHistory}
            isLoading={history.isLoading}
            emptyText={S.emptyGestorHistory}
            sellerNames={sellerNames}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
