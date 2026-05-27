import { useMemo, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import type { ICustomer, ID, ISeller } from "@/shared/types";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentStore } from "@/features/multistore";
import { DashboardLayout } from "@/features/shell/layouts";
import { EmptyState } from "@/features/shell/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatPercent } from "@/shared/utils/format";
import { useSellersProvider } from "@/providers/data";
import { displayCustomerName } from "../utils/recencyFormat";
import { CustomerListCard, type ICustomerListRow } from "../components/CustomerListCard";
import { usePositivationFilters } from "../hooks/usePositivationFilters";
import { usePositivationMetrics } from "../hooks/usePositivationMetrics";
import { POSITIVATION_STRINGS as S } from "../i18n/pt-BR";

const ALLOWED_ROLES = new Set(["Owner", "Gestor", "Vendedor", "Financeiro"]);

type TabId = "all" | "positivated" | "pending" | "atrisk";

/**
 * Seller drill-down page (`/app/gestao/positivacao/$sellerId`). PRD-044.
 *
 * Vendedor only sees their own; Gestor sees any seller of their store; Owner
 * sees any. The page reuses `usePositivationMetrics` with a `sellerId` scope
 * so the engine math (eligible customers, positivated set, at-risk) runs
 * naturally filtered.
 */
export function SellerPositivationPage() {
  const navigate = useNavigate();
  const { sellerId } = useParams({ from: "/app/gestao/positivacao/$sellerId" });
  const { userRole, currentUser } = useAuth();
  const { currentStore } = useCurrentStore();
  const sellersProvider = useSellersProvider();
  const [activeTab, setActiveTab] = useState<TabId>("all");

  const storeLocked = userRole === "Gestor";
  const sellerLocked = userRole === "Vendedor";
  const sellerLockedId = sellerLocked ? currentUser?.sellerId : undefined;

  // Vendedor can only open their own drill-down.
  const accessDenied =
    !userRole || !ALLOWED_ROLES.has(userRole) || (sellerLocked && sellerLockedId !== sellerId);

  const filtersCtx = useMemo(
    () => ({
      gestorLockedStoreId: storeLocked ? (currentStore?.id ?? undefined) : undefined,
      sellerLockedId: sellerId,
    }),
    [storeLocked, currentStore?.id, sellerId],
  );
  const filtersCtl = usePositivationFilters(filtersCtx);

  const scope = useMemo(
    () => ({
      storeId: storeLocked ? (currentStore?.id ?? undefined) : undefined,
      sellerId,
    }),
    [storeLocked, currentStore?.id, sellerId],
  );

  const { metrics, isLoading, hasError, refetch } = usePositivationMetrics({
    window: filtersCtl.window,
    previousWindow: filtersCtl.previousWindow,
    scope,
    enabled: !accessDenied,
  });

  const sellersQuery = useQuery({
    queryKey: ["positivation-drill", "sellers", scope.storeId],
    queryFn: () => sellersProvider.list({ storeId: scope.storeId }),
    staleTime: 60_000,
    enabled: !accessDenied,
  });
  const seller = useMemo<ISeller | undefined>(
    () => sellersQuery.data?.find((s) => s.id === sellerId),
    [sellersQuery.data, sellerId],
  );
  const sellersById = useMemo<Map<ID, ISeller>>(() => {
    const map = new Map<ID, ISeller>();
    for (const s of sellersQuery.data ?? []) map.set(s.id, s);
    return map;
  }, [sellersQuery.data]);

  // Memoized lists must run on every render (hook order); they degrade
  // gracefully to [] when metrics is null. Render-side early returns below.
  const allRows: ICustomerListRow[] = useMemo(() => {
    if (!metrics) return [];
    const atRiskMap = new Map<ID, number>();
    for (const r of metrics.atRisk) atRiskMap.set(r.customer.id, r.daysUntilDormant);
    return metrics.eligible.map((customer) => ({
      customer,
      atRisk: atRiskMap.has(customer.id),
      daysUntilDormant: atRiskMap.get(customer.id),
    }));
  }, [metrics]);

  const positivatedRows: ICustomerListRow[] = useMemo(() => {
    if (!metrics) return [];
    return allRows.filter((r) => metrics.positivatedIds.has(r.customer.id));
  }, [allRows, metrics]);

  const pendingRows: ICustomerListRow[] = useMemo(() => {
    if (!metrics) return [];
    return allRows.filter((r) => !metrics.positivatedIds.has(r.customer.id));
  }, [allRows, metrics]);

  const atRiskRows: ICustomerListRow[] = useMemo(() => {
    return allRows.filter((r) => r.atRisk);
  }, [allRows]);

  if (accessDenied) {
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

  if (hasError) {
    return (
      <DashboardLayout>
        <EmptyState
          icon="mdi:alert-circle-outline"
          title="Falha ao carregar drill-down"
          description="Tente novamente."
          actionLabel="Tentar novamente"
          onAction={refetch}
        />
      </DashboardLayout>
    );
  }

  if (!isLoading && sellersQuery.data && !seller) {
    return (
      <DashboardLayout>
        <EmptyState
          icon="mdi:account-question-outline"
          title={S.sellerNotFoundTitle}
          description={S.sellerNotFoundDescription}
          actionLabel={S.drillBack}
          actionTo="/app/gestao/positivacao"
        />
      </DashboardLayout>
    );
  }

  const handleContact = (customer: ICustomer) => {
    const name = displayCustomerName(customer);
    toast.info(S.contactToastFallback(name));
    void navigate({ to: "/app/atendimento", search: { q: name } });
  };

  const handleOpenProfile = (customer: ICustomer) => {
    void navigate({ to: "/app/clientes/$id", params: { id: customer.id } });
  };

  const sellerName = seller?.name ?? "—";
  const totalPortfolio = metrics?.totalCustomers ?? 0;
  const positivatedCount = metrics?.positivatedCount ?? 0;
  const rate = metrics?.positivationRate ?? 0;
  const projection = metrics?.projection ?? 0;

  return (
    <DashboardLayout>
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void navigate({ to: "/app/gestao/positivacao" })}
            className="gap-1"
          >
            <Icon icon="mdi:chevron-left" size={16} />
            {S.drillBack}
          </Button>
        </div>
      </div>

      <header className="mb-6 flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
          <Icon icon="mdi:account-check" size={26} className="text-primary" />
          {sellerName}
        </h1>
        <p className="text-sm text-muted-foreground">{S.drillTitle}</p>
      </header>

      <section
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
        aria-label="KPIs do vendedor"
      >
        <KpiTile label={S.drillKpiPortfolio} value={totalPortfolio} isLoading={isLoading} />
        <KpiTile label={S.kpiPositivated} value={positivatedCount} isLoading={isLoading} />
        <KpiTile label={S.kpiRate} value={formatPercent(rate)} isLoading={isLoading} isString />
        <KpiTile label={S.kpiProjection} value={projection} isLoading={isLoading} />
      </section>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabId)} className="mt-6">
        <TabsList>
          <TabsTrigger value="all">
            {S.drillTabsAll} ({allRows.length})
          </TabsTrigger>
          <TabsTrigger value="positivated">
            {S.drillTabsPositivated} ({positivatedRows.length})
          </TabsTrigger>
          <TabsTrigger value="pending">
            {S.drillTabsPending} ({pendingRows.length})
          </TabsTrigger>
          <TabsTrigger value="atrisk">
            {S.drillTabsAtRisk} ({atRiskRows.length})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="all" className="mt-4">
          <CustomerListCard
            title={S.drillTabsAll}
            icon="mdi:account-multiple-outline"
            rows={allRows}
            sellersById={sellersById}
            emptyLabel="Sem clientes na carteira deste vendedor."
            isLoading={isLoading}
            onContact={handleContact}
            onOpenProfile={handleOpenProfile}
          />
        </TabsContent>
        <TabsContent value="positivated" className="mt-4">
          <CustomerListCard
            title={S.drillTabsPositivated}
            icon="mdi:check-circle-outline"
            rows={positivatedRows}
            sellersById={sellersById}
            emptyLabel="Ninguém positivou ainda no período."
            isLoading={isLoading}
            onContact={handleContact}
            onOpenProfile={handleOpenProfile}
          />
        </TabsContent>
        <TabsContent value="pending" className="mt-4">
          <CustomerListCard
            title={S.drillTabsPending}
            icon="mdi:account-clock-outline"
            rows={pendingRows}
            sellersById={sellersById}
            emptyLabel={S.customersEmptyNotPositivated}
            isLoading={isLoading}
            onContact={handleContact}
            onOpenProfile={handleOpenProfile}
          />
        </TabsContent>
        <TabsContent value="atrisk" className="mt-4">
          <CustomerListCard
            title={S.drillTabsAtRisk}
            icon="mdi:account-alert-outline"
            rows={atRiskRows}
            sellersById={sellersById}
            emptyLabel={S.customersEmptyAtRisk}
            isLoading={isLoading}
            onContact={handleContact}
            onOpenProfile={handleOpenProfile}
          />
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
}

function KpiTile({
  label,
  value,
  isLoading,
  isString,
}: {
  label: string;
  value: number | string;
  isLoading?: boolean;
  isString?: boolean;
}) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {isLoading ? (
        <Skeleton className="h-7 w-20" />
      ) : (
        <span className="text-2xl font-semibold tracking-tight text-foreground">
          {isString ? (value as string) : (value as number).toLocaleString("pt-BR")}
        </span>
      )}
    </Card>
  );
}
