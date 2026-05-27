import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ID, ISeller } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { useCurrentRole } from "@/features/rbac/hooks/useCurrentRole";
import { useCurrentStore } from "@/features/multistore";
import { EmptyState } from "@/features/shell/components/EmptyState";
import { useSellersProvider } from "@/providers/data";
import { MovementHeader } from "../components/MovementHeader";
import { MovementKpis } from "../components/MovementKpis";
import { MovementTable } from "../components/MovementTable";
import { useInventoryMovements } from "../hooks/useInventoryMovements";
import { useInventoryMovementFilters } from "../hooks/useInventoryMovementsFilters";
import { INVENTORY_MOVEMENT_STRINGS as S } from "../i18n/pt-BR";

const ALLOWED_ROLES = new Set(["Owner", "Gestor", "Financeiro"]);

/**
 * `/app/gestao/estoque-movimentacao` — Inventory Movement (PRD-052).
 *
 * Read-only chronological ledger of stock movements. On MVP only
 * `saida_venda` and `devolucao` rows are derived from paid / returned
 * orders. Entradas, ajustes and transferências are placeholders for
 * Fase 2 (DINTEC integration).
 */
export function InventoryMovementPage() {
  const role = useCurrentRole();
  const { accessibleStores, currentStore } = useCurrentStore();
  const sellersProvider = useSellersProvider();
  const filters = useInventoryMovementFilters();

  const isOwner = role === "Owner";
  const isAllowed = role != null && ALLOWED_ROLES.has(role);

  const accessibleStoreIds = useMemo(() => accessibleStores.map((s) => s.id), [accessibleStores]);

  // Non-Owner roles are pinned to the active store regardless of UI filter.
  const effectiveStoreId: ID | "all" = isOwner
    ? filters.state.storeId
    : ((currentStore?.id ?? accessibleStoreIds[0] ?? "all") as ID | "all");

  const sellersQuery = useQuery({
    queryKey: ["sellers-for-movements"] as const,
    queryFn: () => sellersProvider.list({ active: true }),
    staleTime: 60_000,
    enabled: isAllowed,
  });

  const sellersById = useMemo<Map<ID, ISeller>>(() => {
    const m = new Map<ID, ISeller>();
    (sellersQuery.data ?? []).forEach((s) => m.set(s.id, s));
    return m;
  }, [sellersQuery.data]);

  const result = useInventoryMovements(
    {
      storeId: effectiveStoreId,
      type: filters.state.type,
      productQuery: filters.state.productQuery,
      period: filters.state.period,
      sellerId: filters.state.sellerId,
    },
    isAllowed ? accessibleStoreIds : [],
  );

  if (!isAllowed) {
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
      <MovementHeader
        type={filters.state.type}
        onTypeChange={filters.setType}
        productQuery={filters.state.productQuery}
        onProductQueryChange={filters.setProductQuery}
        period={filters.state.period}
        onPeriodChange={filters.setPeriod}
        sellerId={filters.state.sellerId}
        onSellerChange={filters.setSellerId}
        storeId={filters.state.storeId}
        onStoreChange={filters.setStoreId}
        sellers={sellersQuery.data ?? []}
        stores={accessibleStores}
        canFilterStore={isOwner && accessibleStores.length > 1}
        activeCount={filters.activeCount}
        onClear={filters.reset}
      />

      <MovementKpis kpis={result.kpis} />

      {result.isError ? (
        <Card className="flex flex-col items-center gap-3 border-destructive/40 bg-destructive/10 p-6 text-sm">
          <Icon icon="mdi:alert-circle-outline" size={28} className="text-destructive" />
          <p className="text-destructive">{S.errorTitle}</p>
          <Button variant="outline" size="sm" onClick={result.refetch}>
            {S.errorRetry}
          </Button>
        </Card>
      ) : result.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      ) : (
        <MovementTable
          rows={result.filtered}
          sellersById={sellersById}
          page={filters.state.page}
          onPageChange={filters.setPage}
        />
      )}
    </div>
  );
}
