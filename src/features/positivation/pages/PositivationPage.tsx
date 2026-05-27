import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import type { ICustomer, ID, ISeller } from "@/shared/types";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentStore } from "@/features/multistore";
import { DashboardLayout } from "@/features/shell/layouts";
import { EmptyState } from "@/features/shell/components/EmptyState";
import { useSellersProvider } from "@/providers/data";
import { displayCustomerName } from "../utils/recencyFormat";
import { PositivationHeader } from "../components/PositivationHeader";
import { PositivationKpis } from "../components/PositivationKpis";
import { PositivationEvolutionChart } from "../components/PositivationEvolutionChart";
import { PositivationBySellerTable } from "../components/PositivationBySellerTable";
import { CustomerListCard, type ICustomerListRow } from "../components/CustomerListCard";
import { usePositivationFilters } from "../hooks/usePositivationFilters";
import { usePositivationMetrics } from "../hooks/usePositivationMetrics";
import { POSITIVATION_STRINGS as S } from "../i18n/pt-BR";

const ALLOWED_ROLES = new Set(["Owner", "Gestor", "Vendedor", "Financeiro"]);

/**
 * Positivation main page (`/app/gestao/positivacao`). PRD-044.
 *
 * KPIs (base, positivated, rate, projection, at-risk), evolution chart (line
 * vs proportional expected), by-seller table (Owner/Gestor/Financeiro only)
 * and two customer lists — not-positivated and at-risk. Vendedor sees only
 * their own scope and the by-seller table is hidden.
 */
export function PositivationPage() {
  const navigate = useNavigate();
  const { userRole, currentUser } = useAuth();
  const { currentStore } = useCurrentStore();
  const sellersProvider = useSellersProvider();

  const storeLocked = userRole === "Gestor";
  const sellerLocked = userRole === "Vendedor";
  const sellerLockedId = sellerLocked ? currentUser?.sellerId : undefined;

  const filtersCtx = useMemo(
    () => ({
      gestorLockedStoreId: storeLocked ? (currentStore?.id ?? undefined) : undefined,
      sellerLockedId,
    }),
    [storeLocked, currentStore?.id, sellerLockedId],
  );

  const filtersCtl = usePositivationFilters(filtersCtx);

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

  const { metrics, daily, trends, isLoading, hasError, refetch } = usePositivationMetrics({
    window: filtersCtl.window,
    previousWindow: filtersCtl.previousWindow,
    scope,
    enabled: userRole !== undefined && ALLOWED_ROLES.has(userRole),
  });

  // Load all sellers for the by-seller table label + customer-card "seller" labels.
  const sellersQuery = useQuery({
    queryKey: ["positivation-page", "sellers", scope.storeId],
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
        <EmptyState
          icon="mdi:alert-circle-outline"
          title="Falha ao carregar positivação"
          description="Tente novamente ou recarregue a página."
          actionLabel="Tentar novamente"
          onAction={refetch}
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

  const handleSellerDrill = (sellerId: ID) => {
    void navigate({
      to: "/app/gestao/positivacao/$sellerId",
      params: { sellerId },
      search:
        filtersCtl.filters.period === "month_current" ? {} : { periodo: filtersCtl.filters.period },
    });
  };

  const notPositivatedRows: ICustomerListRow[] =
    metrics?.notPositivated.map((customer) => ({ customer })) ?? [];

  const atRiskRows: ICustomerListRow[] =
    metrics?.atRisk.map(({ customer, daysUntilDormant }) => ({
      customer,
      atRisk: true,
      daysUntilDormant,
    })) ?? [];

  const canSeeBySeller = userRole === "Owner" || userRole === "Gestor" || userRole === "Financeiro";

  return (
    <DashboardLayout>
      <PositivationHeader
        filters={filtersCtl.filters}
        storeLocked={storeLocked}
        sellerLocked={sellerLocked}
        activeFilterCount={filtersCtl.activeCount}
        onPeriod={filtersCtl.setPeriod}
        onStore={filtersCtl.setStore}
        onSeller={filtersCtl.setSeller}
        onReset={filtersCtl.reset}
      />

      <PositivationKpis
        totalCustomers={metrics?.totalCustomers ?? 0}
        positivatedCount={metrics?.positivatedCount ?? 0}
        positivationRate={metrics?.positivationRate ?? 0}
        projection={metrics?.projection ?? 0}
        atRiskCount={metrics?.atRisk.length ?? 0}
        trends={trends}
        isLoading={isLoading}
      />

      <section className="mt-6">
        <PositivationEvolutionChart data={daily} isLoading={isLoading} />
      </section>

      {canSeeBySeller && (
        <section className="mt-6">
          <PositivationBySellerTable
            rows={metrics?.bySeller ?? []}
            isLoading={isLoading}
            onSellerClick={handleSellerDrill}
          />
        </section>
      )}

      <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CustomerListCard
          title={S.sectionNotPositivated}
          icon="mdi:account-clock-outline"
          rows={notPositivatedRows}
          sellersById={sellersById}
          emptyLabel={S.customersEmptyNotPositivated}
          isLoading={isLoading}
          onContact={handleContact}
          onOpenProfile={handleOpenProfile}
        />
        <CustomerListCard
          title={S.sectionAtRisk}
          icon="mdi:account-alert-outline"
          rows={atRiskRows}
          sellersById={sellersById}
          emptyLabel={S.customersEmptyAtRisk}
          isLoading={isLoading}
          onContact={handleContact}
          onOpenProfile={handleOpenProfile}
        />
      </section>
    </DashboardLayout>
  );
}
