import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { ID, ISeller } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentStore } from "@/features/multistore";
import { DashboardLayout } from "@/features/shell/layouts";
import { EmptyState } from "@/features/shell/components/EmptyState";
import { useSellersProvider } from "@/providers/data";
import { useQuery } from "@tanstack/react-query";
import { useCommissionMetrics } from "../hooks/useCommissionMetrics";
import { useCommissionTrigger } from "../hooks/useCommissionTrigger";
import { useCommissionsFilters } from "../hooks/useCommissionsFilters";
import { canClosePeriod, labelForPeriod, currentPeriod, previousPeriod } from "../utils/periods";
import { CommissionsHeader } from "../components/CommissionsHeader";
import { CommissionsKpiGrid } from "../components/CommissionsKpiGrid";
import { CommissionsBySellerTable } from "../components/CommissionsBySellerTable";
import { CommissionsMyOrdersTable } from "../components/CommissionsMyOrdersTable";
import { ClosePeriodDialog } from "../components/ClosePeriodDialog";
import { COMMISSIONS_STRINGS as S } from "../i18n/pt-BR";

const ALLOWED_ROLES = new Set(["Owner", "Gestor", "Vendedor", "Financeiro"]);

/**
 * Main commissions page (`/app/gestao/comissoes`) — PRD-047.
 *
 * Renders differently per role:
 *  - Vendedor: individual view — KPIs + table of own period orders.
 *  - Gestor / Owner / Financeiro: consolidated view — KPIs + per-seller table.
 *
 * Triggers commission emission for paid orders that don't yet have a record
 * via `useCommissionTrigger`.
 */
export function CommissionsPage() {
  const navigate = useNavigate();
  const { userRole, currentUser } = useAuth();
  const { currentStore } = useCurrentStore();
  const storeId = currentStore?.id ?? "00000000-0000-0000-0000-000000000001";

  const isSellerView = userRole === "Vendedor";
  const lockedSellerId = isSellerView ? currentUser?.sellerId : undefined;

  const filtersCtl = useCommissionsFilters({ sellerLockedId: lockedSellerId });

  useCommissionTrigger({ storeId, enabled: ALLOWED_ROLES.has(userRole ?? "") });

  const metrics = useCommissionMetrics({
    storeId,
    period: filtersCtl.filters.period,
    sellerId: isSellerView
      ? lockedSellerId
      : filtersCtl.filters.sellerId === "all"
        ? undefined
        : (filtersCtl.filters.sellerId as ID),
    enabled: ALLOWED_ROLES.has(userRole ?? ""),
  });

  const sellersProvider = useSellersProvider();
  const sellersQuery = useQuery({
    queryKey: ["commissions", "sellers", storeId],
    queryFn: () => sellersProvider.list({ storeId, active: true }),
    staleTime: 60_000,
    enabled: ALLOWED_ROLES.has(userRole ?? ""),
  });

  const sellersById = useMemo<Map<ID, ISeller>>(() => {
    const map = new Map<ID, ISeller>();
    for (const s of sellersQuery.data ?? []) map.set(s.id, s);
    return map;
  }, [sellersQuery.data]);

  const sellerOptions = useMemo(
    () =>
      (sellersQuery.data ?? [])
        .filter((s) => s.type === "internal" && s.id !== "seller-joao-gallo")
        .map((s) => ({ id: s.id, name: s.fullName })),
    [sellersQuery.data],
  );

  const canClose =
    !isSellerView &&
    canClosePeriod(filtersCtl.filters.period) &&
    !(currentStore?.settings.commissionSettings.closedPeriods ?? []).includes(
      filtersCtl.filters.period,
    );

  if (!userRole || !ALLOWED_ROLES.has(userRole)) {
    return (
      <DashboardLayout>
        <EmptyState
          icon="mdi:shield-lock-outline"
          title="Acesso restrito"
          description="Esta tela é visível apenas para vendedores, gestores, owner e financeiro."
          actionLabel="Voltar ao início"
          actionTo="/app/inicio"
        />
      </DashboardLayout>
    );
  }

  const engineDisabled = currentStore && !currentStore.settings.commissionSettings.active;
  if (engineDisabled) {
    return (
      <DashboardLayout>
        <EmptyState
          icon="mdi:cash-off"
          title="Comissões desativadas"
          description="A engine de comissões está desligada para esta loja. O Owner pode reativar em Configurações → Comissões."
          actionLabel={userRole === "Owner" ? "Abrir configurações" : undefined}
          actionTo={userRole === "Owner" ? "/app/configuracoes/comissoes" : undefined}
        />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <CommissionsHeader
        period={filtersCtl.filters.period}
        sellerId={filtersCtl.filters.sellerId}
        sellers={sellerOptions}
        sellerLocked={isSellerView}
        activeFilterCount={filtersCtl.activeCount}
        onPeriodChange={filtersCtl.setPeriod}
        onSellerChange={filtersCtl.setSeller}
        onReset={filtersCtl.reset}
        subtitle={isSellerView ? S.subtitleSeller : S.subtitleManager}
        actions={
          canClose ? (
            <ClosePeriodDialog
              period={filtersCtl.filters.period}
              storeId={storeId}
              totalToPay={metrics.totals.calculated}
              eligibleCount={metrics.commissions.filter((c) => c.status === "calculated").length}
              onClosed={() => metrics.refetch()}
            />
          ) : null
        }
      />

      <section className="mt-6">
        <CommissionsKpiGrid
          totals={metrics.totals}
          previousTotal={metrics.previousTotal}
          previousDeltaPct={metrics.previousDeltaPct}
          previousLabel={labelForPeriod(previousPeriod(filtersCtl.filters.period))}
        />
      </section>

      <section className="mt-6">
        {metrics.isLoading ? (
          <Card className="p-5">
            <Skeleton className="h-72 w-full" />
          </Card>
        ) : metrics.commissions.length === 0 ? (
          <Card className="p-12 text-center">
            <Icon icon="mdi:cash-clock" size={36} className="mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm font-semibold text-foreground">
              {isSellerView ? S.drillEmpty : S.bySellerEmpty}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Período atual: {labelForPeriod(filtersCtl.filters.period)}
            </p>
            {filtersCtl.filters.period !== currentPeriod() && (
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => filtersCtl.setPeriod(currentPeriod())}
              >
                Ir para o mês atual
              </Button>
            )}
          </Card>
        ) : isSellerView ? (
          <CommissionsMyOrdersTable
            commissions={metrics.commissions}
            onContestDone={() => metrics.refetch()}
            canContest
          />
        ) : (
          <CommissionsBySellerTable
            entries={metrics.bySeller}
            sellersById={sellersById}
            onDrill={(sellerId) =>
              void navigate({
                to: "/app/gestao/comissoes/$sellerId",
                params: { sellerId },
                search: { periodo: filtersCtl.filters.period },
              })
            }
          />
        )}
      </section>
    </DashboardLayout>
  );
}
