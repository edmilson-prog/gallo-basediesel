import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ABCClass, ID, ISeller } from "@/shared/types";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentStore } from "@/features/multistore";
import { DashboardLayout } from "@/features/shell/layouts";
import { EmptyState } from "@/features/shell/components/EmptyState";
import { useSellersProvider } from "@/providers/data";
import { ABCHeader } from "../components/ABCHeader";
import { ABCKpis } from "../components/ABCKpis";
import { ParetoChart } from "../components/ParetoChart";
import { MigrationBanners } from "../components/MigrationBanners";
import { ABCCustomersTable } from "../components/ABCCustomersTable";
import { useABCFilters } from "../hooks/useABCFilters";
import { useABCClassification } from "../hooks/useABCClassification";
import { ABC_STRINGS as S } from "../i18n/pt-BR";

const ALLOWED_ROLES = new Set(["Owner", "Gestor", "Vendedor", "Financeiro"]);

/**
 * ABC Curve main page (`/app/gestao/abc`). PRD-045.
 *
 * Header (period/store/seller URL-synced filters) + KPI strip (total, total
 * revenue, A/B/C cards) + migration banners (subiu/caiu/novo) + Pareto chart
 * + top customers table (top 25 by revenue). Drill-down to per-class page
 * via clickable KPIs and banners.
 */
export function ABCCurvePage() {
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

  const filtersCtl = useABCFilters(filtersCtx);

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

  const { metrics, settings, isLoading, hasError, refetch } = useABCClassification({
    window: filtersCtl.window,
    previousWindow: filtersCtl.previousWindow,
    scope,
    enabled: userRole !== null && ALLOWED_ROLES.has(userRole),
  });

  const sellersQuery = useQuery({
    queryKey: ["abc-page", "sellers", scope.storeId],
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
          <h2 className="text-2xl font-semibold text-foreground">Falha ao carregar curva ABC</h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Tente novamente ou recarregue a página.
          </p>
          <button
            type="button"
            onClick={refetch}
            className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Tentar novamente
          </button>
        </div>
      </DashboardLayout>
    );
  }

  const handleClassDrill = (klass: ABCClass) => {
    void navigate({
      to: "/app/gestao/abc/$class",
      params: { class: klass },
    });
  };

  const handleOpenProfile = (customerId: ID) => {
    void navigate({ to: "/app/clientes/$id", params: { id: customerId } });
  };

  // Top customers across all classes (sorted by rank ASC).
  const topRecords = (metrics?.recordsWithMigration ?? []).slice(0, 25);

  return (
    <DashboardLayout>
      <ABCHeader
        filters={filtersCtl.filters}
        storeLocked={storeLocked}
        sellerLocked={sellerLocked}
        activeFilterCount={filtersCtl.activeCount}
        onPeriod={filtersCtl.setPeriod}
        onStore={filtersCtl.setStore}
        onSeller={filtersCtl.setSeller}
        onReset={filtersCtl.reset}
      />

      <ABCKpis
        totalCustomers={metrics?.totalCustomers ?? 0}
        totalRevenue={metrics?.totalRevenue ?? 0}
        byClass={
          metrics?.byClass ?? {
            A: { class: "A", count: 0, revenue: 0, revenuePct: 0, customers: [] },
            B: { class: "B", count: 0, revenue: 0, revenuePct: 0, customers: [] },
            C: { class: "C", count: 0, revenue: 0, revenuePct: 0, customers: [] },
          }
        }
        isLoading={isLoading}
        onClassClick={handleClassDrill}
      />

      <section className="mt-6">
        <MigrationBanners
          upgradedToA={metrics?.migrations.upgradedToA ?? []}
          downgradedFromA={metrics?.migrations.downgradedFromA ?? []}
          newCustomersInA={metrics?.migrations.newCustomersInA ?? []}
          isLoading={isLoading}
          onViewClass={(klass) => handleClassDrill(klass)}
        />
      </section>

      <section className="mt-6">
        <ParetoChart
          records={metrics?.records ?? []}
          classAThreshold={settings.classAThreshold}
          classBThreshold={settings.classBThreshold}
          isLoading={isLoading}
        />
      </section>

      <section className="mt-6">
        <ABCCustomersTable
          title="Top contribuintes"
          records={topRecords}
          sellersById={sellersById}
          isLoading={isLoading}
          onOpenProfile={handleOpenProfile}
        />
      </section>
    </DashboardLayout>
  );
}
