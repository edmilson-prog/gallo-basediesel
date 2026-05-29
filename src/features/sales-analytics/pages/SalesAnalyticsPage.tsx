import { useMemo } from "react";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentStore } from "@/features/multistore";
import { DashboardLayout } from "@/features/shell/layouts";
import { EmptyState } from "@/features/shell/components/EmptyState";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Icon } from "@/components/Icon";
import { useSalesFilters } from "../hooks/useSalesFilters";
import { useSalesAnalytics } from "../hooks/useSalesAnalytics";
import { useFunnelMetrics } from "../hooks/useFunnelMetrics";
import { SalesHeader } from "../components/SalesHeader";
import { SalesEvolutionChart } from "../components/charts/SalesEvolutionChart";
import { SalesOverviewTab } from "../components/tabs/SalesOverviewTab";
import { SellersTab } from "../components/tabs/SellersTab";
import { SalesProductsTab } from "../components/tabs/SalesProductsTab";
import { SalesCustomersTab } from "../components/tabs/SalesCustomersTab";
import { SalesFunnelTab } from "../components/tabs/SalesFunnelTab";
import { SALES_ANALYTICS_STRINGS as S } from "../i18n/pt-BR";

type TabId = "overview" | "sellers" | "products" | "customers" | "funnel";

function buildTabDefs(canSeeSellers: boolean): { id: TabId; label: string; icon: string }[] {
  const base: { id: TabId; label: string; icon: string }[] = [
    { id: "overview", label: S.tabOverview, icon: "mdi:view-dashboard-outline" },
  ];
  if (canSeeSellers) {
    base.push({ id: "sellers", label: S.tabSellers, icon: "mdi:trophy-outline" });
  }
  base.push(
    { id: "products", label: S.tabProducts, icon: "mdi:package-variant-closed" },
    { id: "customers", label: S.tabCustomers, icon: "mdi:account-group-outline" },
    { id: "funnel", label: S.tabFunnel, icon: "mdi:filter-variant" },
  );
  return base;
}

const ALLOWED_ROLES = new Set(["Owner", "Gestor", "Vendedor", "Financeiro"]);

export function SalesAnalyticsPage() {
  const { userRole, currentUser } = useAuth();
  const { currentStore } = useCurrentStore();

  const storeLocked = userRole === "Gestor";
  const sellerLocked = userRole === "Vendedor";
  const storeId = currentStore?.id ?? "store-matriz";
  const sellerLockedId = sellerLocked ? currentUser?.sellerId : undefined;

  const filtersCtx = useMemo(
    () => ({
      gestorLockedStoreId: storeLocked ? storeId : undefined,
      sellerLockedId,
    }),
    [storeLocked, storeId, sellerLockedId],
  );

  const filtersCtl = useSalesFilters(filtersCtx);

  // Resolve scope for queries — Owner sees everything; Gestor → store; Vendedor → seller.
  const scope = useMemo(() => {
    const scopeStoreId =
      storeLocked || filtersCtl.filters.store !== "all"
        ? filtersCtl.filters.store === "all"
          ? storeId
          : filtersCtl.filters.store
        : undefined;
    const scopeSellerId = sellerLocked
      ? sellerLockedId
      : filtersCtl.filters.seller !== "all"
        ? filtersCtl.filters.seller
        : undefined;
    return {
      storeId: scopeStoreId,
      sellerId: scopeSellerId,
    };
  }, [
    storeLocked,
    sellerLocked,
    sellerLockedId,
    storeId,
    filtersCtl.filters.store,
    filtersCtl.filters.seller,
  ]);

  const analytics = useSalesAnalytics({
    filters: filtersCtl.filters,
    window: filtersCtl.window,
    previousWindow: filtersCtl.previousWindow,
    scope,
  });

  const funnel = useFunnelMetrics({
    storeId: scope.storeId,
    sellerId: scope.sellerId,
    window: filtersCtl.window,
  });

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

  const tab = (filtersCtl.activeTab as TabId) ?? "overview";
  const canDrillDown = userRole === "Owner" || userRole === "Gestor";
  const canSeeSellers =
    userRole === "Owner" || userRole === "Gestor" || userRole === "Vendedor";
  const sellersViewerId = userRole === "Vendedor" ? currentUser?.sellerId : undefined;
  const tabDefs = buildTabDefs(canSeeSellers);
  const selectedSellerParam =
    typeof filtersCtl.filters.seller === "string" && filtersCtl.filters.seller !== "all"
      ? filtersCtl.filters.seller
      : undefined;

  return (
    <DashboardLayout>
      <SalesHeader
        filters={filtersCtl.filters}
        storeLocked={storeLocked}
        sellerLocked={sellerLocked}
        availableBrands={analytics.availableBrands}
        activeFilterCount={filtersCtl.activeCount}
        onPeriod={filtersCtl.setPeriod}
        onStore={filtersCtl.setStore}
        onSeller={filtersCtl.setSeller}
        onCategory={filtersCtl.setCategory}
        onVehicleBrand={filtersCtl.setVehicleBrand}
        onChannel={filtersCtl.setChannel}
        onReset={filtersCtl.reset}
      />

      <Tabs value={tab} onValueChange={(v) => filtersCtl.setTab(v)} className="w-full">
        <TabsList className="mb-6 flex h-auto w-full flex-wrap gap-1 bg-muted/40 p-1">
          {tabDefs.map((def) => (
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
          <div className="mb-4">
            <SalesEvolutionChart scope={scope} canDrillDown={canDrillDown} />
          </div>
          <SalesOverviewTab
            analytics={analytics}
            onCategoryFilter={filtersCtl.setCategory}
            onBrandFilter={filtersCtl.setVehicleBrand}
          />
        </TabsContent>
        {canSeeSellers && (
          <TabsContent value="sellers" className="focus-visible:outline-none">
            <SellersTab
              storeId={scope.storeId ?? storeId}
              viewerSellerId={sellersViewerId}
              selectedSellerId={selectedSellerParam}
              onSelectSeller={(id) => filtersCtl.setSeller(id ?? "all")}
            />
          </TabsContent>
        )}
        <TabsContent value="products" className="focus-visible:outline-none">
          <SalesProductsTab analytics={analytics} onCategoryFilter={filtersCtl.setCategory} />
        </TabsContent>
        <TabsContent value="customers" className="focus-visible:outline-none">
          <SalesCustomersTab analytics={analytics} />
        </TabsContent>
        <TabsContent value="funnel" className="focus-visible:outline-none">
          <SalesFunnelTab funnel={funnel} />
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
}
