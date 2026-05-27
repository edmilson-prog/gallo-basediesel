import { useEffect, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import type { ICustomer, ID, ISeller } from "@/shared/types";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentStore } from "@/features/multistore";
import { DashboardLayout } from "@/features/shell/layouts";
import { EmptyState } from "@/features/shell/components/EmptyState";
import { useSellersProvider } from "@/providers/data";
import { PortfolioHeader } from "../components/PortfolioHeader";
import { PortfolioKpis } from "../components/PortfolioKpis";
import { PortfolioDistributionChart } from "../components/PortfolioDistributionChart";
import { PortfolioEvolutionChart } from "../components/PortfolioEvolutionChart";
import { PortfolioTransitionsCard } from "../components/PortfolioTransitionsCard";
import { PortfolioBySellerTable } from "../components/PortfolioBySellerTable";
import { PortfolioRiskList } from "../components/PortfolioRiskList";
import { usePortfolioFilters } from "../hooks/usePortfolioFilters";
import { usePortfolioMetrics } from "../hooks/usePortfolioMetrics";
import { PORTFOLIO_STRINGS as S } from "../i18n/pt-BR";

const ALLOWED_ROLES = new Set(["Owner", "Gestor", "Vendedor", "Financeiro"]);

function customerDisplayName(customer: ICustomer): string {
  if (customer.type === "B2B") return customer.nomeFantasia || customer.razaoSocial;
  return customer.fullName;
}

/**
 * Portfolio Analytics main page (`/app/gestao/carteira-analitica`). PRD-046.
 *
 * Vendedor is redirected to the drill-down of their own portfolio so they only
 * ever see their slice. Gestor sees their store; Owner sees cross-store.
 */
export function PortfolioAnalyticsPage() {
  const navigate = useNavigate();
  const { userRole, currentUser } = useAuth();
  const { currentStore } = useCurrentStore();
  const sellersProvider = useSellersProvider();

  const storeLocked = userRole === "Gestor";
  const sellerLocked = userRole === "Vendedor";
  const sellerLockedId = sellerLocked ? currentUser?.sellerId : undefined;

  // Vendedor → redirect to their own drill-down so they only ever see their slice.
  useEffect(() => {
    if (sellerLocked && sellerLockedId) {
      void navigate({
        to: "/app/gestao/carteira-analitica/$sellerId",
        params: { sellerId: sellerLockedId },
        replace: true,
      });
    }
  }, [sellerLocked, sellerLockedId, navigate]);

  const filtersCtx = useMemo(
    () => ({
      gestorLockedStoreId: storeLocked ? (currentStore?.id ?? undefined) : undefined,
      sellerLockedId,
    }),
    [storeLocked, currentStore?.id, sellerLockedId],
  );
  const filtersCtl = usePortfolioFilters(filtersCtx);

  const scope = useMemo(() => {
    const scopeStoreId =
      storeLocked || filtersCtl.filters.store !== "all"
        ? filtersCtl.filters.store === "all"
          ? (currentStore?.id ?? undefined)
          : filtersCtl.filters.store
        : undefined;
    const scopeSellerId = sellerLocked
      ? sellerLockedId
      : filtersCtl.filters.seller !== "all"
        ? filtersCtl.filters.seller
        : undefined;
    return { storeId: scopeStoreId, sellerId: scopeSellerId };
  }, [
    storeLocked,
    sellerLocked,
    sellerLockedId,
    currentStore?.id,
    filtersCtl.filters.store,
    filtersCtl.filters.seller,
  ]);

  const { metrics, evolution, isLoading, hasError, refetch } = usePortfolioMetrics({
    window: filtersCtl.window,
    scope,
    enabled: userRole !== null && ALLOWED_ROLES.has(userRole),
  });

  const sellersQuery = useQuery({
    queryKey: ["portfolio-page", "sellers", scope.storeId],
    queryFn: () => sellersProvider.list({ storeId: scope.storeId }),
    staleTime: 60_000,
  });
  const sellersById = useMemo<Map<ID, ISeller>>(() => {
    const map = new Map<ID, ISeller>();
    for (const s of sellersQuery.data ?? []) map.set(s.id, s);
    return map;
  }, [sellersQuery.data]);

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

  const handleContact = (customer: ICustomer) => {
    const name = customerDisplayName(customer);
    toast.info(S.contactToastFallback(name));
    void navigate({ to: "/app/atendimento", search: { q: name } });
  };

  const handleOpenProfile = (customer: ICustomer) => {
    void navigate({ to: "/app/clientes/$id", params: { id: customer.id } });
  };

  const handleSellerDrill = (sellerId: ID) => {
    void navigate({
      to: "/app/gestao/carteira-analitica/$sellerId",
      params: { sellerId },
      search:
        filtersCtl.filters.period === "rolling_12m" ? {} : { periodo: filtersCtl.filters.period },
    });
  };

  const canSeeBySeller = userRole === "Owner" || userRole === "Gestor" || userRole === "Financeiro";

  return (
    <DashboardLayout>
      <PortfolioHeader
        filters={filtersCtl.filters}
        storeLocked={storeLocked}
        sellerLocked={sellerLocked}
        activeFilterCount={filtersCtl.activeCount}
        onPeriod={filtersCtl.setPeriod}
        onStore={filtersCtl.setStore}
        onSeller={filtersCtl.setSeller}
        onReset={filtersCtl.reset}
      />

      <PortfolioKpis
        total={metrics?.totalCustomers ?? 0}
        byStatus={
          metrics?.byStatus ?? {
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
            metrics?.byStatus ?? {
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
        {canSeeBySeller ? (
          <PortfolioBySellerTable
            rows={metrics?.bySeller ?? []}
            isLoading={isLoading}
            onSellerClick={handleSellerDrill}
          />
        ) : null}
      </section>

      <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
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
        <PortfolioRiskList
          title={S.sectionAtRiskCritical}
          icon="mdi:alert-octagon-outline"
          rows={metrics?.atRisk.dormantAtRisk ?? []}
          sellersById={sellersById}
          isLoading={isLoading}
          emptyLabel={S.riskEmptyCritical}
          tone="bad"
          onContact={handleContact}
          onOpenProfile={handleOpenProfile}
        />
      </section>
    </DashboardLayout>
  );
}
