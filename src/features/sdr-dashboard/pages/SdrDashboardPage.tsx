import { useMemo, useState } from "react";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentStore } from "@/features/multistore";
import { DashboardLayout } from "@/features/shell/layouts";
import { EmptyState } from "@/features/shell/components/EmptyState";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePlatformSettings } from "@/features/admin-settings/hooks/usePlatformSettings";
import { Icon } from "@/components/Icon";
import { useSdrDashboardFilters } from "../hooks/useSdrDashboardFilters";
import { useSdrDashboardData } from "../hooks/useSdrDashboardData";
import { useSdrAlerts } from "../hooks/useSdrAlerts";
import { SdrDashboardHeader } from "../components/SdrDashboardHeader";
import { SdrAlertsBanner } from "../components/SdrAlertsBanner";
import { SdrOverviewTab } from "../components/tabs/SdrOverviewTab";
import { SdrHistoryTab } from "../components/tabs/SdrHistoryTab";
import { SdrMetricsTab } from "../components/tabs/SdrMetricsTab";
import { SdrTemplatesTab } from "../components/tabs/SdrTemplatesTab";
import { SdrSettingsTab } from "../components/tabs/SdrSettingsTab";

type TabId = "overview" | "history" | "metrics" | "templates" | "settings";

const TAB_DEFS: { id: TabId; label: string; icon: string }[] = [
  { id: "overview", label: "Visão geral", icon: "mdi:view-dashboard-outline" },
  { id: "history", label: "Histórico", icon: "mdi:history" },
  { id: "metrics", label: "Métricas", icon: "mdi:chart-bar" },
  { id: "templates", label: "Templates", icon: "mdi:message-text-outline" },
  { id: "settings", label: "Configurações", icon: "mdi:cog-outline" },
];

export function SdrDashboardPage() {
  const { userRole } = useAuth();
  const { currentStore } = useCurrentStore();
  const storeLocked = userRole === "Gestor";
  const storeId = currentStore?.id ?? "store-matriz";

  const filtersCtx = useMemo(
    () => ({ gestorLockedStoreId: storeLocked ? storeId : undefined }),
    [storeLocked, storeId],
  );
  const filtersCtl = useSdrDashboardFilters(filtersCtx);
  const data = useSdrDashboardData({
    storeId: filtersCtl.filters.store === "all" ? undefined : filtersCtl.filters.store,
    window: filtersCtl.window,
    previousWindow: filtersCtl.previousWindow,
  });

  const settingsCtl = usePlatformSettings(storeId);
  const alerts = useSdrAlerts({
    data,
    settings: settingsCtl.settings,
    allSessions: data.sessions,
  });

  const [tab, setTab] = useState<TabId>("overview");

  if (userRole !== "Owner" && userRole !== "Gestor") {
    return (
      <DashboardLayout>
        <EmptyState
          icon="mdi:shield-lock-outline"
          title="Acesso restrito"
          description="O painel do SDR é visível apenas para Owner e Gestor."
          actionLabel="Voltar ao atendimento"
          actionTo="/app/atendimento"
        />
      </DashboardLayout>
    );
  }

  const canEdit = userRole === "Owner";
  const sdrEnabled = settingsCtl.settings?.sdrEnabled ?? false;

  return (
    <DashboardLayout>
      <SdrDashboardHeader
        filters={filtersCtl.filters}
        storeLocked={storeLocked}
        sdrEnabled={sdrEnabled}
        onPeriod={filtersCtl.setPeriod}
        onStore={filtersCtl.setStore}
      />

      <SdrAlertsBanner alerts={alerts} />

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabId)} className="w-full">
        <TabsList className="mb-6 flex h-auto w-full flex-wrap gap-1 bg-muted/40 p-1">
          {TAB_DEFS.map((def) => (
            <TabsTrigger
              key={def.id}
              value={def.id}
              className="flex h-9 flex-1 min-w-[120px] items-center justify-center gap-2 text-xs sm:text-sm"
            >
              <Icon icon={def.icon} size={16} />
              {def.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="focus-visible:outline-none">
          <SdrOverviewTab data={data} />
        </TabsContent>
        <TabsContent value="history" className="focus-visible:outline-none">
          <SdrHistoryTab data={data} storeId={storeId} />
        </TabsContent>
        <TabsContent value="metrics" className="focus-visible:outline-none">
          <SdrMetricsTab data={data} onCellClick={() => setTab("history")} />
        </TabsContent>
        <TabsContent value="templates" className="focus-visible:outline-none">
          <SdrTemplatesTab
            settings={settingsCtl.settings}
            loading={settingsCtl.loading}
            saving={settingsCtl.saving}
            update={settingsCtl.update}
            canEdit={canEdit}
          />
        </TabsContent>
        <TabsContent value="settings" className="focus-visible:outline-none">
          <SdrSettingsTab
            settings={settingsCtl.settings}
            loading={settingsCtl.loading}
            saving={settingsCtl.saving}
            update={settingsCtl.update}
            canEdit={canEdit}
            onJumpToTemplates={() => setTab("templates")}
          />
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
}
