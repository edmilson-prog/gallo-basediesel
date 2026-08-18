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
import { RankingHighlightWidget } from "@/features/gamification";
import { CommissionsWidget } from "@/features/commissions";
import { RecentMovementsWidget } from "@/features/inventory-movement";
import { InsightsBanner } from "@/features/insights";
import { useNpsMetrics, useNpsSettings } from "@/features/nps";
import { ForecastWidget } from "@/features/sales-forecast";
import { useEcommerceOrdersSummary } from "@/features/ecommerce-integration";
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
  const { currentStore, accessibleStores } = useCurrentStore();

  const storeLocked = userRole === "Gestor";
  const filtersCtx = useMemo(
    () => ({ gestorLockedStoreId: storeLocked ? (currentStore?.id ?? undefined) : undefined }),
    [storeLocked, currentStore?.id],
  );
  const filtersCtl = useCockpitFilters(filtersCtx);

  // KPI #12 — was a "Em breve" placeholder since v0.27.0 (PRD-040), now live.
  // Below the honest minimum the hook returns a null score, so the card shows
  // "Coletando dados (N/5)" as a tag rather than inventing a number.
  const nps = useNpsMetrics({ windowDays: 90 });
  const npsSettings = useNpsSettings();
  const npsCollecting = nps.data?.state === "collecting";
  const npsCardProps = {
    value: npsCollecting ? null : (nps.data?.score ?? null),
    isLoading: nps.isLoading,
    hasError: nps.isError,
    tag: npsCollecting
      ? S.kpiNpsCollecting(nps.data?.n ?? 0, nps.data?.minResponses ?? 5)
      : undefined,
    sparkline: (nps.data?.monthly ?? [])
      .map((point) => point.score)
      .filter((score): score is number => score !== null),
  };

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
    enabled: userRole !== null && ALLOWED_ROLES.has(userRole),
  });

  const goals = useGoalsWithProgress({ storeId: scope.storeId, statuses: ["ativa"] });
  const alertsCtl = useCockpitAlerts({ metrics, activeGoals: goals.items });

  const comparisonLabel = filtersCtl.filters.compare === "yoy" ? S.kpiVsYoY : S.kpiVsPrevious;

  // PRD-067 RF-019: breakdown of total orders by origin, shown in the orders KPI tooltip.
  const ecommerceSummary = useEcommerceOrdersSummary(scope.storeId);
  const ordersBreakdown = useMemo(() => {
    const byOrigin = ecommerceSummary.data?.byOrigin;
    if (!byOrigin) return undefined;
    const labels: Record<string, string> = {
      whatsapp: "WhatsApp/SDR",
      ecommerce: "E-commerce",
      portal: "Portal B2B",
      pwa_externo: "Vendedor externo",
      manual: "Manual",
    };
    return Object.entries(byOrigin)
      .filter(([, count]) => count > 0)
      .map(([origin, count]) => ({ label: labels[origin] ?? origin, value: count }));
  }, [ecommerceSummary.data]);

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

      <div className="mb-6">
        <InsightsBanner
          storeId={scope.storeId ?? currentStore?.id ?? "00000000-0000-0000-0000-000000000001"}
          accessibleStoreIds={accessibleStores.map((s) => s.id)}
        />
      </div>

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
          helpText={S.kpiRevenueHelp}
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
          helpText={S.kpiAvgTicketHelp}
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
          helpText={S.kpiOrdersHelp}
          value={metrics.kpis.orderCount.current}
          formatValue={formatNumber}
          trend={metrics.kpis.orderCount.trend}
          sparkline={metrics.kpis.orderCount.sparkline}
          breakdown={ordersBreakdown}
          comparisonLabel={comparisonLabel}
          isLoading={metrics.isLoading}
          hasError={metrics.hasError}
          onClick={() => void navigate({ to: "/app/pedidos" })}
        />
        <ExecutiveKpiCard
          icon="mdi:scale-balance"
          label={S.kpiMargin}
          helpText={S.kpiMarginHelp}
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
          helpText={S.kpiActiveCustomersHelp}
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
          helpText={S.kpiPositivationHelp}
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
          helpText={S.kpiChurnHelp}
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
          helpText={S.kpiNewCustomersHelp}
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
          helpText={S.kpiOpenPipelineHelp}
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
          helpText={S.kpiConversionRateHelp}
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
          helpText={S.kpiPendingCommissionsHelp}
          value={metrics.kpis.pendingCommissions.current}
          formatValue={formatBRLCompact}
          trend={metrics.kpis.pendingCommissions.trend}
          comparisonLabel={comparisonLabel}
          isLoading={metrics.isLoading}
          hasError={metrics.hasError}
          tag={S.kpiStub}
          onClick={() => void navigate({ to: "/app/gestao/comissoes" })}
        />
        {/* "Card no Cockpit", from the NPS panel's Parâmetros tab. Hidden only
            once the setting has actually loaded and says no — otherwise a slow
            settings read would blink the card out of an executive dashboard. */}
        {npsSettings.data && !npsSettings.data.showWidget ? null : (
          <ExecutiveKpiCard
            icon="mdi:emoticon-outline"
            label={S.kpiNps}
            helpText={S.kpiNpsHelp}
            {...npsCardProps}
            formatValue={formatNumber}
            onClick={() => void navigate({ to: "/app/nps" })}
          />
        )}
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

      <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3" aria-label={S.sectionCharts}>
        <RankingHighlightWidget storeId={currentStore?.id ?? undefined} />
        <CommissionsWidget storeId={currentStore?.id ?? "00000000-0000-0000-0000-000000000001"} />
        <RecentMovementsWidget
          storeId={scope.storeId}
          accessibleStoreIds={accessibleStores.map((s) => s.id)}
        />
      </section>

      <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3" aria-label={S.sectionCharts}>
        <ForecastWidget storeId={scope.storeId} />
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
