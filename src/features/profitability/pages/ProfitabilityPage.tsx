import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Icon } from "@/components/Icon";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentStore } from "@/features/multistore";
import { EmptyState } from "@/features/shell/components/EmptyState";
import { DREAlertsBanner } from "@/features/dre/components/DREAlertsBanner";
import { ProfitabilityHeader } from "../components/ProfitabilityHeader";
import { ProductTab } from "../components/ProductTab";
import { CategoryTab } from "../components/CategoryTab";
import { CustomerTab } from "../components/CustomerTab";
import { SellerTab } from "../components/SellerTab";
import { useProfitabilityFilters, type ProfitabilityTab } from "../hooks/useProfitabilityFilters";
import { useProfitabilityData } from "../hooks/useProfitabilityData";
import { useProfitabilityAlerts } from "../hooks/useProfitabilityAlerts";
import { PROFITABILITY_STRINGS as S } from "../i18n/pt-BR";

const ALLOWED_ROLES = new Set(["Owner", "Gestor", "Financeiro"]);

function buildMonthOptions(monthCount = 18, now: Date = new Date()): string[] {
  const out: string[] = [];
  for (let i = 0; i < monthCount; i += 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/**
 * `/app/gestao/rentabilidade` — Profitability Analytics (PRD-049).
 *
 * Four-tabbed analysis (product / category / customer / seller) with KPIs,
 * alerts, drill-downs into PRD-030 (part) and PRD-012 (customer). Vendedor /
 * SDR / Cliente are blocked upstream by `requireAuth`.
 */
export function ProfitabilityPage() {
  const { userRole } = useAuth();
  const { currentStore } = useCurrentStore();
  const storeId = currentStore?.id ?? "store-matriz";
  const filters = useProfitabilityFilters();

  const data = useProfitabilityData({
    storeId,
    monthKey: filters.state.monthKey,
    sellerId: filters.state.sellerId,
    category: filters.state.category,
    brand: filters.state.brand,
  });

  const alerts = useProfitabilityAlerts({
    productRows: data.productRows,
    sellerRows: data.sellerRows,
    coverage: data.coverage,
  });

  const monthOptions = useMemo(() => buildMonthOptions(18), []);

  if (!userRole || !ALLOWED_ROLES.has(userRole)) {
    return (
      <EmptyState
        icon="mdi:shield-lock-outline"
        title={S.blockedTitle}
        description={S.blockedDescription}
        actionLabel="Voltar ao início"
        actionTo="/app/inicio"
      />
    );
  }

  return (
    <div className="space-y-6">
      <ProfitabilityHeader
        monthKey={filters.state.monthKey}
        monthOptions={monthOptions}
        onMonthKeyChange={filters.setMonthKey}
        sellers={data.sellers}
        sellerId={filters.state.sellerId}
        onSellerChange={filters.setSeller}
        category={filters.state.category}
        onCategoryChange={filters.setCategory}
        brands={data.brands}
        brand={filters.state.brand}
        onBrandChange={filters.setBrand}
      />

      <div className="flex items-start gap-3 rounded-md border border-info/40 bg-info/10 p-3 text-xs text-muted-foreground">
        <Icon icon="mdi:database-search-outline" size={16} className="text-info shrink-0 mt-0.5" />
        <span>
          {S.coverageHint(
            data.coverage.pct * 100,
            data.coverage.missingItems,
            data.coverage.missingParts,
          )}
        </span>
      </div>

      {data.isError && (
        <Card className="border-destructive/40 bg-destructive/10 p-4 text-sm">
          <Icon
            icon="mdi:alert-circle-outline"
            size={18}
            className="mr-2 inline align-text-bottom text-destructive"
          />
          Não foi possível carregar os dados. Tente novamente.
        </Card>
      )}

      {data.isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      ) : data.paidOrders.length === 0 ? (
        <Card className="p-10 text-center">
          <Icon icon="mdi:inbox-outline" size={36} className="mx-auto text-muted-foreground" />
          <h2 className="mt-3 text-base font-semibold text-foreground">{S.pageEmptyTitle}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{S.pageEmptyDescription}</p>
        </Card>
      ) : (
        <>
          <DREAlertsBanner alerts={alerts} />

          <Tabs
            value={filters.state.tab}
            onValueChange={(v) => filters.setTab(v as ProfitabilityTab)}
          >
            <TabsList className="w-full justify-start sm:w-auto">
              <TabsTrigger value="product">{S.tabProduct}</TabsTrigger>
              <TabsTrigger value="category">{S.tabCategory}</TabsTrigger>
              <TabsTrigger value="customer">{S.tabCustomer}</TabsTrigger>
              <TabsTrigger value="seller">{S.tabSeller}</TabsTrigger>
            </TabsList>
            <TabsContent value="product" className="mt-5">
              <ProductTab
                rows={data.productRows}
                summary={data.summary}
                coverage={data.coverage}
                subfilter={filters.state.subfilter}
                onSubfilterChange={filters.setSubfilter}
              />
            </TabsContent>
            <TabsContent value="category" className="mt-5">
              <CategoryTab rows={data.categoryRows} rowsPrevious={data.categoryRowsPrevious} />
            </TabsContent>
            <TabsContent value="customer" className="mt-5">
              <CustomerTab rows={data.customerRows} />
            </TabsContent>
            <TabsContent value="seller" className="mt-5">
              <SellerTab rows={data.sellerRows} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
