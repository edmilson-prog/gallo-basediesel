import { useMemo, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import type { CustomerStatus, ICustomer, ID, ISeller } from "@/shared/types";
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
import { FETCH_ALL_PAGE_SIZE, useCustomersProvider, useSellersProvider } from "@/providers/data";
import { PortfolioHeader } from "../components/PortfolioHeader";
import { PortfolioKpis } from "../components/PortfolioKpis";
import { PortfolioDistributionChart } from "../components/PortfolioDistributionChart";
import { PortfolioEvolutionChart } from "../components/PortfolioEvolutionChart";
import { PortfolioTransitionsCard } from "../components/PortfolioTransitionsCard";
import { PortfolioHealthBadge } from "../components/PortfolioHealthBadge";
import { PortfolioRiskList } from "../components/PortfolioRiskList";
import { CustomerPortfolioList } from "../components/CustomerPortfolioList";
import { usePortfolioFilters } from "../hooks/usePortfolioFilters";
import { useSellerPortfolio } from "../hooks/useSellerPortfolio";
import { PORTFOLIO_STRINGS as S } from "../i18n/pt-BR";

const ALLOWED_ROLES = new Set(["Owner", "Gestor", "Vendedor", "Financeiro"]);

type TabId = "all" | "active" | "dormant" | "lost" | "recovery";

const TAB_STATUS: Record<Exclude<TabId, "all">, CustomerStatus> = {
  active: "ativo",
  dormant: "dormente",
  lost: "perdido",
  recovery: "recuperacao",
};

function customerDisplayName(customer: ICustomer): string {
  if (customer.type === "B2B") return customer.nomeFantasia || customer.razaoSocial;
  return customer.fullName;
}

/**
 * Drill-down page (`/app/gestao/carteira-analitica/$sellerId`). PRD-046.
 *
 * Reuses the engines through `useSellerPortfolio` with a `sellerId` scope so
 * KPIs, distribution and transitions reflect only this seller's portfolio. The
 * customer list at the bottom is paginated and filterable by lifecycle status.
 */
export function SellerPortfolioPage() {
  const navigate = useNavigate();
  const { sellerId } = useParams({ from: "/app/gestao/carteira-analitica/$sellerId" });
  const { userRole, currentUser } = useAuth();
  const { currentStore } = useCurrentStore();
  const sellersProvider = useSellersProvider();
  const customersProvider = useCustomersProvider();
  const [activeTab, setActiveTab] = useState<TabId>("all");

  const storeLocked = userRole === "Gestor";
  const sellerLocked = userRole === "Vendedor";
  const sellerLockedId = sellerLocked ? currentUser?.sellerId : undefined;

  const accessDenied =
    !userRole || !ALLOWED_ROLES.has(userRole) || (sellerLocked && sellerLockedId !== sellerId);

  const filtersCtx = useMemo(
    () => ({
      gestorLockedStoreId: storeLocked ? (currentStore?.id ?? undefined) : undefined,
      sellerLockedId: sellerId,
    }),
    [storeLocked, currentStore?.id, sellerId],
  );
  const filtersCtl = usePortfolioFilters(filtersCtx);

  const scopeStoreId = storeLocked ? (currentStore?.id ?? undefined) : undefined;

  const { metrics, evolution, sellerMetrics, isLoading, hasError, refetch } = useSellerPortfolio({
    sellerId,
    window: filtersCtl.window,
    storeId: scopeStoreId,
    enabled: !accessDenied,
  });

  const sellersQuery = useQuery({
    queryKey: ["portfolio-drill", "sellers", scopeStoreId],
    queryFn: () => sellersProvider.list({ storeId: scopeStoreId }),
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

  const customersQuery = useQuery({
    queryKey: ["portfolio-drill", "customers", scopeStoreId, sellerId],
    queryFn: () =>
      customersProvider.list({
        storeId: scopeStoreId,
        sellerIds: [sellerId],
        pageSize: FETCH_ALL_PAGE_SIZE,
      }),
    staleTime: 30_000,
    enabled: !accessDenied,
  });

  const customers = useMemo(() => customersQuery.data?.data ?? [], [customersQuery.data]);
  const filteredCustomers = useMemo<ICustomer[]>(() => {
    if (activeTab === "all") return customers;
    const status = TAB_STATUS[activeTab];
    return customers.filter((c) => c.status === status);
  }, [customers, activeTab]);

  const tabCounts = useMemo(() => {
    const counts: Record<TabId, number> = {
      all: customers.length,
      active: 0,
      dormant: 0,
      lost: 0,
      recovery: 0,
    };
    for (const c of customers) {
      if (c.status === "ativo") counts.active += 1;
      else if (c.status === "dormente") counts.dormant += 1;
      else if (c.status === "perdido") counts.lost += 1;
      else if (c.status === "recuperacao") counts.recovery += 1;
    }
    return counts;
  }, [customers]);

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
        <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
          <h2 className="mt-6 text-2xl font-semibold text-foreground">{S.errorTitle}</h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">{S.errorMessage}</p>
          <button
            type="button"
            onClick={refetch}
            className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            {S.errorRetry}
          </button>
        </div>
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
          actionTo="/app/gestao/carteira-analitica"
        />
      </DashboardLayout>
    );
  }

  const handleContact = (customer: ICustomer) => {
    const name = customerDisplayName(customer);
    toast.info(S.contactToastFallback(name));
    void navigate({ to: "/app/atendimento", search: { q: name } });
  };

  const handleOpenProfile = (customer: ICustomer) => {
    void navigate({ to: "/app/clientes/$id", params: { id: customer.id } });
  };

  const sellerName = seller?.fullName ?? "—";
  const portfolioSize = sellerMetrics?.portfolioSize ?? 0;

  return (
    <DashboardLayout>
      {!sellerLocked && (
        <div className="mb-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void navigate({ to: "/app/gestao/carteira-analitica" })}
            className="gap-1"
          >
            <Icon icon="mdi:chevron-left" size={16} />
            {S.drillBack}
          </Button>
        </div>
      )}

      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
            <Icon icon="mdi:heart-pulse" size={26} className="text-primary" />
            {sellerName}
          </h1>
          <p className="text-sm text-muted-foreground">{S.drillTitle}</p>
        </div>
        {sellerMetrics && (
          <div className="flex items-center gap-3">
            <PortfolioHealthBadge score={sellerMetrics.healthScore} />
            <Card className="flex items-center gap-3 px-3 py-2">
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Ativos</div>
                <div className="text-base font-semibold text-foreground">
                  {formatPercent(sellerMetrics.activePct)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Churn</div>
                <div className="text-base font-semibold text-foreground">
                  {formatPercent(sellerMetrics.churnRate)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Recuperação</div>
                <div className="text-base font-semibold text-foreground">
                  {formatPercent(sellerMetrics.recoveryRate)}
                </div>
              </div>
            </Card>
          </div>
        )}
      </header>

      <PortfolioHeader
        filters={filtersCtl.filters}
        storeLocked
        sellerLocked
        activeFilterCount={filtersCtl.activeCount}
        onPeriod={filtersCtl.setPeriod}
        onStore={filtersCtl.setStore}
        onSeller={filtersCtl.setSeller}
        onReset={filtersCtl.reset}
      />

      <PortfolioKpis
        total={portfolioSize}
        byStatus={
          sellerMetrics?.byStatus ?? {
            ativo: 0,
            dormente: 0,
            perdido: 0,
            recuperacao: 0,
          }
        }
        metrics={metrics}
        isLoading={isLoading}
      />

      <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr_1fr]">
        <PortfolioDistributionChart
          byStatus={
            sellerMetrics?.byStatus ?? {
              ativo: 0,
              dormente: 0,
              perdido: 0,
              recuperacao: 0,
            }
          }
          isLoading={isLoading}
        />
        <div className="lg:col-span-2">
          <PortfolioEvolutionChart data={evolution} isLoading={isLoading} />
        </div>
      </section>

      <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_2fr]">
        <PortfolioTransitionsCard metrics={metrics} isLoading={isLoading} />
        <PortfolioRiskList
          title={S.sectionAtRiskImminent}
          icon="mdi:account-alert-outline"
          rows={metrics?.atRisk.activeAtRisk ?? []}
          sellersById={sellersById}
          isLoading={isLoading}
          emptyLabel={S.riskEmptyImminent}
          tone="warn"
          onContact={handleContact}
          onOpenProfile={handleOpenProfile}
        />
      </section>

      <section className="mt-6">
        <Card className="flex flex-col gap-3 p-5">
          <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground">
            <Icon icon="mdi:account-multiple-outline" size={18} className="text-primary" />
            Carteira completa
          </h2>

          {isLoading ? (
            <Skeleton className="h-72 w-full" />
          ) : (
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabId)}>
              <TabsList>
                <TabsTrigger value="all">
                  {S.drillTabsAll} ({tabCounts.all})
                </TabsTrigger>
                <TabsTrigger value="active">
                  {S.drillTabsActive} ({tabCounts.active})
                </TabsTrigger>
                <TabsTrigger value="dormant">
                  {S.drillTabsDormant} ({tabCounts.dormant})
                </TabsTrigger>
                <TabsTrigger value="lost">
                  {S.drillTabsLost} ({tabCounts.lost})
                </TabsTrigger>
                {tabCounts.recovery > 0 && (
                  <TabsTrigger value="recovery">
                    {S.drillTabsRecovery} ({tabCounts.recovery})
                  </TabsTrigger>
                )}
              </TabsList>
              <TabsContent value={activeTab} className="mt-4">
                <CustomerPortfolioList
                  customers={filteredCustomers}
                  isLoading={customersQuery.isLoading}
                  emptyLabel={S.drillListEmpty}
                  onContact={handleContact}
                  onOpenProfile={handleOpenProfile}
                />
              </TabsContent>
            </Tabs>
          )}
        </Card>
      </section>
    </DashboardLayout>
  );
}
