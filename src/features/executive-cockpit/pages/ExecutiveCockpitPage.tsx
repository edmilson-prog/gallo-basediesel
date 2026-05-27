import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentStore } from "@/features/multistore";
import { DashboardLayout } from "@/features/shell/layouts";
import { EmptyState } from "@/features/shell/components/EmptyState";
import { useGoalsWithProgress } from "@/features/goals";
import { formatBRL, formatBRLCompact } from "@/shared/utils/format";
import { CockpitHeader } from "../components/CockpitHeader";
import { ExecutiveKpiCard } from "../components/ExecutiveKpiCard";
import { ExecutiveAlertsBanner } from "../components/ExecutiveAlertsBanner";
import { ComparativoCard } from "../components/ComparativoCard";
import { RevenueOrdersComposedChart } from "../components/charts/RevenueOrdersComposedChart";
import { PortfolioMiniDonut } from "../components/charts/PortfolioMiniDonut";
import { TopSellersBar } from "../components/charts/TopSellersBar";
import { ABCMiniChart } from "../components/charts/ABCMiniChart";
import { useCockpitFilters } from "../hooks/useCockpitFilters";
import { useCockpitMetrics } from "../hooks/useCockpitMetrics";
import { useCockpitAlerts, type ICockpitAlert } from "../hooks/useCockpitAlerts";
import { EXECUTIVE_COCKPIT_STRINGS as S } from "../i18n/pt-BR";

const ALLOWED_ROLES = new Set(["Owner", "Gestor", "Financeiro"]);

function formatPercentInt(value: number): string {
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function formatNumber(value: number): string {
  return value.toLocaleString("pt-BR");
}

/**
 * Executive Cockpit (`/app/gestao`) — strategic snapshot in one screen.
 *
 * Aggregates metrics from PRDs 041/042/032/031/015 via {@link useCockpitMetrics}
 * and the goals engine via {@link useGoalsWithProgress}. PRDs 044/045/046/047/049
 * are stubbed inside the metrics hook until those features land — drill-downs
 * still navigate to the existing detailed pages (PRD-041, PRD-042) where
 * implemented, and fall back to the current page when the target is pending.
 */
export function ExecutiveCockpitPage() {
  const navigate = useNavigate();
  const { userRole } = useAuth();
  const { currentStore } = useCurrentStore();

  const storeLocked = userRole === "Gestor";
  const filtersCtx = useMemo(
    () => ({ gestorLockedStoreId: storeLocked ? (currentStore?.id ?? undefined) : undefined }),
    [storeLocked, currentStore?.id],
  );
  const filtersCtl = useCockpitFilters(filtersCtx);

  const scope = useMemo(() => {
    const scopeStoreId =
      storeLocked || filtersCtl.filters.store !== "all"
        ? filtersCtl.filters.store === "all"
          ? (currentStore?.id ?? undefined)
          : filtersCtl.filters.store
        : undefined;
    return { storeId: scopeStoreId };
  }, [storeLocked, currentStore?.id, filtersCtl.filters.store]);

  const metrics = useCockpitMetrics({
    window: filtersCtl.window,
    previousWindow: filtersCtl.previousWindow,
    scope,
    enabled: userRole !== undefined && ALLOWED_ROLES.has(userRole),
  });

  const goals = useGoalsWithProgress({ storeId: scope.storeId, statuses: ["ativa"] });
  const alertsCtl = useCockpitAlerts({ metrics, activeGoals: goals.items });

  const comparisonLabel = filtersCtl.filters.compare === "yoy" ? S.kpiVsYoY : S.kpiVsPrevious;

  // Access guard — Owner / Gestor / Financeiro only. Vendedor is blocked.
  if (!userRole || !ALLOWED_ROLES.has(userRole)) {
    return (
      <DashboardLayout>
        <EmptyState
          icon="mdi:shield-lock-outline"
          title={S.accessDeniedTitle}
          description={S.accessDeniedDescription}
          actionLabel={S.accessDeniedAction}
          actionTo="/app/inicio"
        />
      </DashboardLayout>
    );
  }

  const handleAlertView = (alert: ICockpitAlert) => {
    switch (alert.kind) {
      case "churn-spike":
        void navigate({ to: "/app/clientes", search: { status: "perdido" } });
        return;
      case "goals-critical":
      case "revenue-below-target":
        void navigate({ to: "/app/gestao/metas" });
        return;
      case "low-conversion":
        void navigate({ to: "/app/gestao/vendas" });
        return;
    }
  };

  return (
    <DashboardLayout>
      <CockpitHeader
        filters={filtersCtl.filters}
        storeLocked={storeLocked}
        activeFilterCount={filtersCtl.activeCount}
        onPeriod={filtersCtl.setPeriod}
        onStore={filtersCtl.setStore}
        onCompare={filtersCtl.setCompare}
        onReset={filtersCtl.reset}
      />

      {alertsCtl.alerts.length > 0 && (
        <div className="mb-6">
          <ExecutiveAlertsBanner
            alerts={alertsCtl.alerts}
            onDismiss={alertsCtl.dismiss}
            onView={handleAlertView}
          />
        </div>
      )}

      <section
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        aria-label={S.sectionKpis}
      >
        <ExecutiveKpiCard
          icon="mdi:cash-multiple"
          label={S.kpiRevenue}
          value={metrics.kpis.revenue.current}
          formatValue={formatBRLCompact}
          trend={metrics.kpis.revenue.trend}
          sparkline={metrics.kpis.revenue.sparkline}
          comparisonLabel={comparisonLabel}
          isLoading={metrics.isLoading}
          hasError={metrics.hasError}
          onRetry={metrics.refetch}
          onClick={() => void navigate({ to: "/app/gestao/vendas" })}
        />
        <ExecutiveKpiCard
          icon="mdi:receipt-text-outline"
          label={S.kpiAvgTicket}
          value={metrics.kpis.avgTicket.current}
          formatValue={formatBRL}
          trend={metrics.kpis.avgTicket.trend}
          comparisonLabel={comparisonLabel}
          isLoading={metrics.isLoading}
          hasError={metrics.hasError}
          onClick={() => void navigate({ to: "/app/gestao/vendas" })}
        />
        <ExecutiveKpiCard
          icon="mdi:clipboard-list-outline"
          label={S.kpiOrders}
          value={metrics.kpis.orderCount.current}
          formatValue={formatNumber}
          trend={metrics.kpis.orderCount.trend}
          sparkline={metrics.kpis.orderCount.sparkline}
          comparisonLabel={comparisonLabel}
          isLoading={metrics.isLoading}
          hasError={metrics.hasError}
          onClick={() => void navigate({ to: "/app/pedidos" })}
        />
        <ExecutiveKpiCard
          icon="mdi:scale-balance"
          label={S.kpiMargin}
          value={metrics.kpis.marginPct.current}
          formatValue={formatPercentInt}
          trend={metrics.kpis.marginPct.trend}
          comparisonLabel={comparisonLabel}
          isLoading={metrics.isLoading}
          hasError={metrics.hasError}
          tag={S.kpiStub}
          onClick={() => void navigate({ to: "/app/gestao/rentabilidade" })}
        />
        <ExecutiveKpiCard
          icon="mdi:account-multiple-check-outline"
          label={S.kpiActiveCustomers}
          value={metrics.kpis.activeCustomers.current}
          formatValue={formatNumber}
          trend={metrics.kpis.activeCustomers.trend}
          comparisonLabel={comparisonLabel}
          isLoading={metrics.isLoading}
          hasError={metrics.hasError}
          onClick={() => void navigate({ to: "/app/clientes", search: { status: "ativo" } })}
        />
        <ExecutiveKpiCard
          icon="mdi:account-check-outline"
          label={S.kpiPositivation}
          value={metrics.kpis.positivationRate.current}
          formatValue={formatPercentInt}
          trend={metrics.kpis.positivationRate.trend}
          comparisonLabel={comparisonLabel}
          isLoading={metrics.isLoading}
          hasError={metrics.hasError}
          onClick={() => void navigate({ to: "/app/gestao/positivacao" })}
        />
        <ExecutiveKpiCard
          icon="mdi:account-arrow-down-outline"
          label={S.kpiChurn}
          value={metrics.kpis.churnCount.current}
          formatValue={formatNumber}
          trend={metrics.kpis.churnCount.trend}
          comparisonLabel={comparisonLabel}
          isLoading={metrics.isLoading}
          hasError={metrics.hasError}
          onClick={() => void navigate({ to: "/app/clientes", search: { status: "perdido" } })}
        />
        <ExecutiveKpiCard
          icon="mdi:account-plus-outline"
          label={S.kpiNewCustomers}
          value={metrics.kpis.newCustomers.current}
          formatValue={formatNumber}
          trend={metrics.kpis.newCustomers.trend}
          comparisonLabel={comparisonLabel}
          isLoading={metrics.isLoading}
          hasError={metrics.hasError}
          onClick={() => void navigate({ to: "/app/clientes" })}
        />
        <ExecutiveKpiCard
          icon="mdi:file-document-multiple-outline"
          label={S.kpiOpenPipeline}
          value={metrics.kpis.openPipeline.current}
          formatValue={formatBRLCompact}
          trend={metrics.kpis.openPipeline.trend}
          comparisonLabel={comparisonLabel}
          isLoading={metrics.isLoading}
          hasError={metrics.hasError}
          onClick={() => void navigate({ to: "/app/orcamentos" })}
        />
        <ExecutiveKpiCard
          icon="mdi:filter-variant"
          label={S.kpiConversionRate}
          value={metrics.kpis.conversionRate.current}
          formatValue={formatPercentInt}
          trend={metrics.kpis.conversionRate.trend}
          comparisonLabel={comparisonLabel}
          isLoading={metrics.isLoading}
          hasError={metrics.hasError}
          onClick={() => void navigate({ to: "/app/gestao/vendas", search: { aba: "funnel" } })}
        />
        <ExecutiveKpiCard
          icon="mdi:cash-clock"
          label={S.kpiPendingCommissions}
          value={metrics.kpis.pendingCommissions.current}
          formatValue={formatBRLCompact}
          trend={metrics.kpis.pendingCommissions.trend}
          comparisonLabel={comparisonLabel}
          isLoading={metrics.isLoading}
          hasError={metrics.hasError}
          tag={S.kpiStub}
          onClick={() => void navigate({ to: "/app/gestao/comissoes" })}
        />
        <ExecutiveKpiCard
          icon="mdi:emoticon-outline"
          label={S.kpiNps}
          value={null}
          formatValue={formatNumber}
          isLoading={false}
          tag={S.kpiNpsSoon}
        />
      </section>

      <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2" aria-label={S.sectionCharts}>
        <RevenueOrdersComposedChart
          data={metrics.revenueOrdersSeries}
          isLoading={metrics.isLoading}
          onClick={() => void navigate({ to: "/app/gestao/vendas" })}
        />
        <PortfolioMiniDonut
          total={metrics.portfolio.total}
          buckets={metrics.portfolio.buckets}
          isLoading={metrics.isLoading}
          onSliceClick={(status) => void navigate({ to: "/app/clientes", search: { status } })}
        />
        <TopSellersBar
          rows={metrics.topSellers}
          isLoading={metrics.isLoading}
          onClick={() => void navigate({ to: "/app/gestao/vendas" })}
        />
        <ABCMiniChart
          rows={metrics.abcMini}
          isLoading={metrics.isLoading}
          onClick={() => void navigate({ to: "/app/gestao/abc" })}
        />
      </section>

      <section className="mt-6" aria-label={S.sectionComparison}>
        <ComparativoCard
          rows={[
            {
              label: S.comparisonRevenue,
              current: metrics.kpis.revenue.current,
              previous: metrics.kpis.revenue.previous,
              trend: metrics.kpis.revenue.trend,
              isCurrency: true,
            },
            {
              label: S.comparisonOrders,
              current: metrics.kpis.orderCount.current,
              previous: metrics.kpis.orderCount.previous,
              trend: metrics.kpis.orderCount.trend,
            },
            {
              label: S.comparisonAvgTicket,
              current: metrics.kpis.avgTicket.current,
              previous: metrics.kpis.avgTicket.previous,
              trend: metrics.kpis.avgTicket.trend,
              isCurrency: true,
            },
          ]}
          comparisonLabel={comparisonLabel}
        />
      </section>
    </DashboardLayout>
  );
}
