import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentStore } from "@/features/multistore";
import { DashboardLayout } from "@/features/shell/layouts";
import { EmptyState } from "@/features/shell/components/EmptyState";
import { Icon } from "@/components/Icon";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePermission } from "@/features/rbac/hooks/usePermission";
import { ServiceVolumePage } from "@/features/service-volume";
import { useServiceVolumeFilters } from "@/features/service-volume/hooks/useServiceVolumeFilters";
import { SERVICE_VOLUME_STRINGS as SV } from "@/features/service-volume/i18n/pt-BR";
import { useRealtimeConversations } from "@/features/conversations/hooks/useRealtimeConversations";
import { useDashboardFilters } from "../hooks/useDashboardFilters";
import { useDashboardSnapshot } from "../hooks/useDashboardSnapshot";
import { useManagerDashboardSettings } from "../hooks/useManagerDashboardSettings";
import { useCarteiraHealth } from "../hooks/useCarteiraHealth";
import { DashboardFilters } from "../components/DashboardFilters";
import { CarteiraHealthDonut } from "../components/CarteiraHealthDonut";
import { ActiveAlertsList } from "../components/ActiveAlertsList";
import { AlertSettingsModal } from "../components/AlertSettingsModal";
import { IdleAlertsSettingsSection } from "@/features/idle-alerts";
import { GoalsWidget } from "@/features/goals";
import { PositivationWidget } from "@/features/positivation";
import { PortfolioHealthWidget } from "@/features/portfolio-analytics";
import { TopPerformersWidget } from "@/features/gamification";
import { CriticalInsightsWidget } from "@/features/insights";
import { EcommerceOrdersWidget } from "@/features/ecommerce-integration";
import { IndicatorsWidget } from "@/features/indicators/components/IndicatorsWidget";
import { MANAGER_DASHBOARD_STRINGS } from "../i18n/pt-BR";

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
  const { snapshot, isLoading } = useDashboardSnapshot(
    filters.filters,
    filters.window,
    filters.previousWindow,
    {
      fallbackStoreId: currentStore?.id ?? null,
      enabled: userRole === "Owner" || userRole === "Gestor",
      refreshKey: realtime.tick,
    },
  );
  const settings = useManagerDashboardSettings(currentStore?.id ?? null);
  const carteira = useCarteiraHealth(snapshot);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const canEditSettings = userRole === "Owner";
  const canViewVolume = usePermission("service_volume", "view");
  const volume = useServiceVolumeFilters(filtersCtx);
  const activeTab = canViewVolume ? volume.state.tab : "operacao";

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
      <Tabs value={activeTab} onValueChange={(v) => volume.setTab(v as "operacao" | "atendimento")}>
        <TabsList className="mb-4">
          <TabsTrigger value="operacao">{SV.tabOperacao}</TabsTrigger>
          {canViewVolume && <TabsTrigger value="atendimento">{SV.tabAtendimento}</TabsTrigger>}
        </TabsList>
        <TabsContent value="operacao">
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
            aria-label="Metas, positivação, saúde da carteira, top performers e indicadores"
          >
            <GoalsWidget storeId={currentStore?.id ?? "00000000-0000-0000-0000-000000000001"} />
            <PositivationWidget storeId={currentStore?.id ?? "00000000-0000-0000-0000-000000000001"} />
            <PortfolioHealthWidget storeId={currentStore?.id ?? "00000000-0000-0000-0000-000000000001"} />
            <TopPerformersWidget storeId={currentStore?.id ?? "00000000-0000-0000-0000-000000000001"} />
            <div className="sm:col-span-2 lg:col-span-4">
              <IndicatorsWidget storeId={currentStore?.id ?? "00000000-0000-0000-0000-000000000001"} />
            </div>
          </section>

          <section
            className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2"
            aria-label="Insights e e-commerce"
          >
            <CriticalInsightsWidget storeId={currentStore?.id ?? "00000000-0000-0000-0000-000000000001"} />
            <EcommerceOrdersWidget storeId={currentStore?.id ?? "00000000-0000-0000-0000-000000000001"} />
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
            <ActiveAlertsList />
          </section>

          {canEditSettings && (
            <>
              <section className="mt-6" aria-label="Configurações de alertas de ociosidade">
                <IdleAlertsSettingsSection storeId={currentStore?.id ?? null} />
              </section>
              <AlertSettingsModal
                open={settingsOpen}
                onOpenChange={setSettingsOpen}
                initial={settings.settings}
                onSave={(next) => settings.update(next)}
                saving={settings.saving}
              />
            </>
          )}
        </TabsContent>
        {canViewVolume && (
          <TabsContent value="atendimento">
            <ServiceVolumePage gestorLockedStoreId={filtersCtx.gestorLockedStoreId} />
          </TabsContent>
        )}
      </Tabs>
    </DashboardLayout>
  );
}
