import { useNavigate, useSearch } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCurrentRole } from "@/features/rbac/hooks/useCurrentRole";
import { useCurrentStore } from "@/features/multistore";
import { DashboardLayout } from "@/features/shell/layouts";
import { EmptyState } from "@/features/shell/components/EmptyState";
import { SectionHeader } from "@/features/admin-settings/components/SectionHeader";
import { DashboardTab } from "../components/tabs/DashboardTab";
import { ContentTab } from "../components/tabs/ContentTab";
import { CouponsTab } from "../components/tabs/CouponsTab";
import { CampaignsTab } from "../components/tabs/CampaignsTab";
import { AnalyticsTab } from "../components/tabs/AnalyticsTab";
import { STOREFRONT_ADMIN_STRINGS as S } from "../i18n/pt-BR";

export interface IStorefrontAdminSearch {
  tab?: string;
  subtab?: string;
}

const VALID_TABS = ["dashboard", "conteudo", "cupons", "campanhas", "analise"] as const;
type AdminTab = (typeof VALID_TABS)[number];

function normalizeTab(tab: string | undefined): AdminTab {
  return (VALID_TABS as readonly string[]).includes(tab ?? "") ? (tab as AdminTab) : "dashboard";
}

/**
 * `/app/storefront-admin` — consolidated e-commerce admin panel (PRD-066).
 *
 * Owner edits everything; Gestor sees Dashboard and Análise read-only (the
 * Conteúdo/Cupons/Campanhas tabs are hidden for non-Owners). Vendedor is
 * blocked upstream by the route guard.
 */
export function StorefrontAdminPage() {
  const role = useCurrentRole();
  const navigate = useNavigate({ from: "/app/storefront-admin" });
  const search = useSearch({ from: "/app/storefront-admin" }) as IStorefrontAdminSearch;
  const { currentStoreId } = useCurrentStore();
  const storeId = currentStoreId ?? "00000000-0000-0000-0000-000000000001";

  const isOwner = role === "Owner";
  const activeTab = normalizeTab(search.tab);
  // Non-owners may only land on the read-only tabs.
  const effectiveTab: AdminTab =
    !isOwner && (activeTab === "conteudo" || activeTab === "cupons" || activeTab === "campanhas")
      ? "dashboard"
      : activeTab;

  if (role !== "Owner" && role !== "Gestor") {
    return (
      <EmptyState
        icon="mdi:shield-lock-outline"
        title={S.noAccessTitle}
        description={S.noAccessDescription}
        actionLabel="Voltar"
        actionTo="/app/inicio"
      />
    );
  }

  const handleTabChange = (value: string) => {
    void navigate({
      search: (prev: unknown) => ({ ...(prev as IStorefrontAdminSearch), tab: value }),
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <SectionHeader title={S.pageTitle} description={S.pageDescription} />

        <Tabs value={effectiveTab} onValueChange={handleTabChange} className="space-y-4">
          <TabsList className="flex h-auto w-full justify-start gap-1 overflow-x-auto">
            <TabsTrigger value="dashboard">{S.tabDashboard}</TabsTrigger>
            {isOwner && <TabsTrigger value="conteudo">{S.tabContent}</TabsTrigger>}
            {isOwner && <TabsTrigger value="cupons">{S.tabCoupons}</TabsTrigger>}
            {isOwner && <TabsTrigger value="campanhas">{S.tabCampaigns}</TabsTrigger>}
            <TabsTrigger value="analise">{S.tabAnalysis}</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard">
            <DashboardTab storeId={storeId} />
          </TabsContent>
          {isOwner && (
            <TabsContent value="conteudo">
              <ContentTab defaultSubtab={search.subtab} />
            </TabsContent>
          )}
          {isOwner && (
            <TabsContent value="cupons">
              <CouponsTab />
            </TabsContent>
          )}
          {isOwner && (
            <TabsContent value="campanhas">
              <CampaignsTab />
            </TabsContent>
          )}
          <TabsContent value="analise">
            <AnalyticsTab storeId={storeId} />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
