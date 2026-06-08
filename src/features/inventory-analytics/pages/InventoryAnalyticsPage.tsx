import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Icon } from "@/components/Icon";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentStore } from "@/features/multistore";
import { EmptyState } from "@/features/shell/components/EmptyState";
import { InventoryHeader } from "../components/InventoryHeader";
import { OverviewTab } from "../components/OverviewTab";
import { CriticalTab } from "../components/CriticalTab";
import { XyzTab } from "../components/XyzTab";
import { ExcessTab } from "../components/ExcessTab";
import { useInventoryAnalysis } from "../hooks/useInventoryAnalysis";
import { useInventoryFilters, type InventoryTab } from "../hooks/useInventoryFilters";
import { INVENTORY_STRINGS as S } from "../i18n/pt-BR";

const ALLOWED_ROLES = new Set(["Owner", "Gestor", "Financeiro"]);

/**
 * `/app/gestao/estoque` — Inventory Analytics (PRD-050).
 *
 * Four-tabbed inventory analysis (overview / critical / xyz / excess) with
 * reorder suggestions and capital-tied tracking. Vendedor / SDR / Cliente
 * are blocked upstream by `requireAuth`.
 */
export function InventoryAnalyticsPage() {
  const { userRole } = useAuth();
  const { currentStore } = useCurrentStore();
  const storeId = currentStore?.id ?? "00000000-0000-0000-0000-000000000001";
  const filters = useInventoryFilters();

  const result = useInventoryAnalysis({
    storeId,
    category: filters.state.category,
    brand: filters.state.brand,
    status: filters.state.status,
    curve: filters.state.curve,
  });

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
      <InventoryHeader
        brands={result.brands}
        category={filters.state.category}
        onCategoryChange={filters.setCategory}
        brand={filters.state.brand}
        onBrandChange={filters.setBrand}
        status={filters.state.status}
        onStatusChange={filters.setStatus}
        curve={filters.state.curve}
        onCurveChange={filters.setCurve}
      />

      {result.isError && (
        <Card className="border-destructive/40 bg-destructive/10 p-4 text-sm">
          <Icon
            icon="mdi:alert-circle-outline"
            size={18}
            className="mr-2 inline align-text-bottom text-destructive"
          />
          Não foi possível carregar os dados de estoque. Tente novamente.
        </Card>
      )}

      {result.isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      ) : result.analyses.length === 0 ? (
        <Card className="p-10 text-center">
          <Icon icon="mdi:inbox-outline" size={36} className="mx-auto text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            Nenhum produto ativo encontrado no catálogo.
          </p>
        </Card>
      ) : (
        <Tabs value={filters.state.tab} onValueChange={(v) => filters.setTab(v as InventoryTab)}>
          <TabsList className="w-full justify-start sm:w-auto">
            <TabsTrigger value="overview">{S.tabOverview}</TabsTrigger>
            <TabsTrigger value="critical">{S.tabCritical}</TabsTrigger>
            <TabsTrigger value="xyz">{S.tabXyz}</TabsTrigger>
            <TabsTrigger value="excess">{S.tabExcess}</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="mt-5">
            <OverviewTab metrics={result.filteredMetrics} analyses={result.filtered} />
          </TabsContent>
          <TabsContent value="critical" className="mt-5">
            <CriticalTab rows={result.filteredMetrics.reorderSuggestions} />
          </TabsContent>
          <TabsContent value="xyz" className="mt-5">
            <XyzTab rows={result.filtered} />
          </TabsContent>
          <TabsContent value="excess" className="mt-5">
            <ExcessTab
              rows={result.filteredMetrics.excessProducts}
              totalCapitalInExcess={result.filteredMetrics.capitalInExcess}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
