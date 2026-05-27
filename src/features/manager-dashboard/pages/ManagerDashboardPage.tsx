import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentStore } from "@/features/multistore";
import { DashboardLayout } from "@/features/shell/layouts";
import { EmptyState } from "@/features/shell/components/EmptyState";
import { Icon } from "@/components/Icon";
import { useRealtimeConversations } from "@/features/conversations/hooks/useRealtimeConversations";
import { useDashboardFilters } from "../hooks/useDashboardFilters";
import { useDashboardSnapshot } from "../hooks/useDashboardSnapshot";
import { useKpis } from "../hooks/useKpis";
import { useSellerLoad } from "../hooks/useSellerLoad";
import { useVolumeHeatmap } from "../hooks/useVolumeHeatmap";
import { useManagerDashboardSettings } from "../hooks/useManagerDashboardSettings";
import { useCarteiraHealth } from "../hooks/useCarteiraHealth";
import { useActiveAlerts, alertCustomerId, type IActiveAlert } from "../hooks/useActiveAlerts";
import { DashboardFilters } from "../components/DashboardFilters";
import { KpiCard } from "../components/KpiCard";
import { SellerLoadList } from "../components/SellerLoadList";
import { VolumeHeatmap } from "../components/VolumeHeatmap";
import { CarteiraHealthDonut } from "../components/CarteiraHealthDonut";
import { ActiveAlertsList } from "../components/ActiveAlertsList";
import { AlertSettingsModal } from "../components/AlertSettingsModal";
import { GoalsWidget } from "@/features/goals";
import { PositivationWidget } from "@/features/positivation";
import { PortfolioHealthWidget } from "@/features/portfolio-analytics";
import { TopPerformersWidget } from "@/features/gamification";
import { MANAGER_DASHBOARD_STRINGS } from "../i18n/pt-BR";

function formatMinutes(value: number): string {
  if (value < 60) return `${value} min`;
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}min`;
}

function formatPercent(value: number): string {
  return `${value}%`;
}

/**
 * Operational dashboard for Owner / Gestor — replaces the placeholder
 * `/app/inicio` for those roles. PRD-014 (Phase 1).
 */
export function ManagerDashboardPage() {
  const navigate = useNavigate();
  const { userRole } = useAuth();
  const { currentStore } = useCurrentStore();

  const storeLocked = userRole === "Gestor";
  const filtersCtx = useMemo(
    () => ({ gestorLockedStoreId: storeLocked ? (currentStore?.id ?? undefined) : undefined }),
    [storeLocked, currentStore?.id],
  );

  const filters = useDashboardFilters(filtersCtx);
  const realtime = useRealtimeConversations();
  const { snapshot, isLoading, error, refetch } = useDashboardSnapshot(
    filters.filters,
    filters.window,
    filters.previousWindow,
    {
      fallbackStoreId: currentStore?.id ?? null,
      enabled: userRole === "Owner" || userRole === "Gestor",
      refreshKey: realtime.tick,
    },
  );
  const kpis = useKpis(snapshot);
  const settings = useManagerDashboardSettings(currentStore?.id ?? null);
  const sellerLoad = useSellerLoad(snapshot, {
    overloadThreshold: settings.settings.sellerOverloadThreshold,
  });
  const heatmap = useVolumeHeatmap(snapshot);
  const carteira = useCarteiraHealth(snapshot);
  const { alerts, dismiss } = useActiveAlerts(snapshot, settings.settings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const canEditSettings = userRole === "Owner";

  const handleAlertView = (alert: IActiveAlert) => {
    if (alert.kind === "cliente-a-dormente") {
      const id = alertCustomerId(alert);
      if (id) void navigate({ to: "/app/clientes/$id", params: { id } });
      return;
    }
    void navigate({
      to: alert.view.to,
      search: alert.view.search ?? {},
    });
  };

  const goToInbox = (params: Record<string, string>) => {
    const search: Record<string, string> = {};
    for (const [k, v] of Object.entries(params)) search[k] = v;
    void navigate({ to: "/app/atendimento", search });
  };

  if (userRole === "Vendedor") {
    return (
      <DashboardLayout>
        <EmptyState
          icon="mdi:shield-lock-outline"
          title={MANAGER_DASHBOARD_STRINGS.noAccessTitle}
          description={MANAGER_DASHBOARD_STRINGS.noAccessDescription}
          actionLabel={MANAGER_DASHBOARD_STRINGS.noAccessCta}
          actionTo="/app/atendimento"
        />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <header className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
            <Icon icon="mdi:view-dashboard-outline" size={26} className="text-primary" />
            {MANAGER_DASHBOARD_STRINGS.pageTitle}
          </h1>
          <p className="text-sm text-muted-foreground">{MANAGER_DASHBOARD_STRINGS.pageSubtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => realtime.setEnabled(!realtime.enabled)}
          className="inline-flex items-center gap-2 self-start rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/60 sm:self-auto"
          aria-label={
            realtime.enabled
              ? "Pausar atualização em tempo real"
              : "Retomar atualização em tempo real"
          }
        >
          <span
            className={`h-2 w-2 rounded-full ${realtime.enabled ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/40"}`}
            aria-hidden="true"
          />
          {realtime.enabled ? "Tempo real ativo" : "Atualização pausada"}
        </button>
      </header>

      <div className="mb-6">
        <DashboardFilters
          state={filters.filters}
          storeLocked={storeLocked}
          onPeriod={filters.setPeriod}
          onSeller={filters.setSeller}
          onStore={filters.setStore}
          onChannel={filters.setChannel}
          onReset={filters.reset}
          activeCount={filters.activeCount}
          onOpenSettings={canEditSettings ? () => setSettingsOpen(true) : undefined}
        />
      </div>

      <section
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
        aria-label="Indicadores principais"
      >
        <KpiCard
          icon="mdi:timer-sand"
          label={MANAGER_DASHBOARD_STRINGS.kpiTmaLabel}
          shortLabel={MANAGER_DASHBOARD_STRINGS.kpiTmaShort}
          helpText={MANAGER_DASHBOARD_STRINGS.kpiTmaHelp}
          value={kpis.tmaMinutes.current}
          formatValue={formatMinutes}
          trend={kpis.tmaMinutes.trend}
          isLoading={isLoading}
          hasError={Boolean(error) && !isLoading}
          onRetry={refetch}
          onClick={() => goToInbox({ status: "resolvida" })}
        />
        <KpiCard
          icon="mdi:reply-outline"
          label={MANAGER_DASHBOARD_STRINGS.kpiTmrLabel}
          shortLabel={MANAGER_DASHBOARD_STRINGS.kpiTmrShort}
          helpText={MANAGER_DASHBOARD_STRINGS.kpiTmrHelp}
          value={kpis.tmrMinutes.current}
          formatValue={formatMinutes}
          trend={kpis.tmrMinutes.trend}
          isLoading={isLoading}
          hasError={Boolean(error) && !isLoading}
          onRetry={refetch}
          onClick={() => goToInbox({ status: "em_andamento" })}
        />
        <KpiCard
          icon="mdi:check-circle-outline"
          label={MANAGER_DASHBOARD_STRINGS.kpiResolutionLabel}
          shortLabel={MANAGER_DASHBOARD_STRINGS.kpiResolutionShort}
          helpText={MANAGER_DASHBOARD_STRINGS.kpiResolutionHelp}
          value={kpis.resolutionRatePct.current}
          formatValue={formatPercent}
          trend={kpis.resolutionRatePct.trend}
          isLoading={isLoading}
          hasError={Boolean(error) && !isLoading}
          onRetry={refetch}
          onClick={() => goToInbox({ status: "resolvida" })}
        />
        <KpiCard
          icon="mdi:inbox-arrow-down-outline"
          label={MANAGER_DASHBOARD_STRINGS.kpiBacklogLabel}
          shortLabel={MANAGER_DASHBOARD_STRINGS.kpiBacklogShort}
          helpText={MANAGER_DASHBOARD_STRINGS.kpiBacklogHelp}
          value={kpis.backlog.current}
          isLoading={isLoading}
          hasError={Boolean(error) && !isLoading}
          onRetry={refetch}
          onClick={() => goToInbox({ status: "aguardando" })}
        />
      </section>

      <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2" aria-label="Carga e volume">
        <SellerLoadList
          entries={sellerLoad}
          overloadThreshold={settings.settings.sellerOverloadThreshold}
          isLoading={isLoading}
          onSellerClick={(sellerId) => goToInbox({ assignment: sellerId, status: "em_andamento" })}
        />
        <VolumeHeatmap
          data={heatmap}
          isLoading={isLoading}
          onCellClick={(day, hour) => {
            const now = new Date();
            const offsetToTarget = day - now.getDay();
            const target = new Date(now);
            target.setDate(now.getDate() + offsetToTarget);
            target.setHours(hour, 0, 0, 0);
            const end = new Date(target.getTime() + 3600_000 - 1);
            void navigate({
              to: "/app/atendimento",
              search: {
                period: "30d",
                q: `${target.toISOString().slice(0, 10)} ${hour}h-${hour + 1}h`,
              },
            });
            // The inbox filter doesn't natively accept a time range; we land on
            // the recent-period view and the query reminds the user of the slice.
            void end;
          }}
        />
      </section>

      <section
        className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
        aria-label="Metas, positivação, saúde da carteira e top performers"
      >
        <GoalsWidget storeId={currentStore?.id ?? "store-matriz"} />
        <PositivationWidget storeId={currentStore?.id ?? "store-matriz"} />
        <PortfolioHealthWidget storeId={currentStore?.id ?? "store-matriz"} />
        <TopPerformersWidget storeId={currentStore?.id ?? "store-matriz"} />
      </section>

      <section
        className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2"
        aria-label="Saúde da carteira e alertas"
      >
        <CarteiraHealthDonut
          data={carteira}
          isLoading={isLoading}
          onSliceClick={(status) => void navigate({ to: "/app/clientes", search: { status } })}
        />
        <ActiveAlertsList
          alerts={alerts}
          isLoading={isLoading}
          onView={handleAlertView}
          onDismiss={(alert) => dismiss(alert.hash)}
        />
      </section>

      {canEditSettings && (
        <AlertSettingsModal
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          initial={settings.settings}
          onSave={(next) => settings.update(next)}
          saving={settings.saving}
        />
      )}
    </DashboardLayout>
  );
}
