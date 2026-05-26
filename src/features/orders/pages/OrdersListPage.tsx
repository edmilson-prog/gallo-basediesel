import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ICustomer, ID, ISeller } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentRole } from "@/features/rbac/hooks/useCurrentRole";
import { useCurrentStore } from "@/features/multistore/hooks/useCurrentStore";
import { useSellersProvider } from "@/providers/data/hooks/useSellersProvider";
import { useCustomersProvider } from "@/providers/data/hooks/useCustomersProvider";
import { OrdersHeader } from "../components/list/OrdersHeader";
import { OrdersFiltersBar } from "../components/list/OrdersFiltersBar";
import { OrdersTable } from "../components/list/OrdersTable";
import { OrdersPagination } from "../components/list/OrdersPagination";
import { useOrdersList } from "../hooks/useOrdersList";
import { useOrdersUrlState } from "../hooks/useOrdersUrlState";

export function OrdersListPage() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const role = useCurrentRole();
  const isManagerOrOwner = role === "Owner" || role === "Gestor";
  const isOwner = role === "Owner";
  const { accessibleStores } = useCurrentStore();

  const url = useOrdersUrlState();
  const { filters, sort, page, pageSize } = url;

  const sellerIdLock =
    !isManagerOrOwner && currentUser?.sellerId ? currentUser.sellerId : null;

  const list = useOrdersList(filters, sort, page, pageSize, { sellerIdLock });

  const sellersProvider = useSellersProvider();
  const customersProvider = useCustomersProvider();

  const sellersQuery = useQuery({
    queryKey: ["sellers-for-orders"] as const,
    queryFn: () => sellersProvider.list({ active: true }),
    staleTime: 60_000,
  });
  const sellersMap = useMemo<Map<ID, ISeller>>(() => {
    const m = new Map<ID, ISeller>();
    (sellersQuery.data ?? []).forEach((s) => m.set(s.id, s));
    return m;
  }, [sellersQuery.data]);
  const selectableSellers = useMemo<ISeller[]>(() => {
    const all = sellersQuery.data ?? [];
    if (!isManagerOrOwner && currentUser?.sellerId) {
      return all.filter((s) => s.id === currentUser.sellerId);
    }
    return all;
  }, [sellersQuery.data, isManagerOrOwner, currentUser?.sellerId]);

  const customerIds = useMemo(() => {
    const ids = new Set<ID>();
    list.data.forEach((o) => ids.add(o.customerId));
    return Array.from(ids);
  }, [list.data]);
  const customersQuery = useQuery({
    queryKey: ["customers-for-orders", customerIds.length, customerIds.join(",")] as const,
    queryFn: () => customersProvider.list({ pageSize: 500 }),
    enabled: customerIds.length > 0,
    staleTime: 60_000,
  });
  const customersMap = useMemo<Map<ID, ICustomer>>(() => {
    const m = new Map<ID, ICustomer>();
    (customersQuery.data?.data ?? []).forEach((c) => m.set(c.id, c));
    return m;
  }, [customersQuery.data]);

  const handleRowClick = (id: ID) => {
    void navigate({ to: "/app/pedidos/$id", params: { id } });
  };

  const hasResults = list.data.length > 0;
  const isFirstLoad = list.isLoading && !hasResults;
  const showEmpty = !isFirstLoad && !hasResults;

  return (
    <div className="flex h-[calc(100vh-4rem)] min-h-0 flex-col bg-background">
      <OrdersHeader
        total={list.total}
        searchValue={filters.search}
        onSearchChange={(q) => url.setSearch(q)}
      />

      <OrdersFiltersBar
        filters={filters}
        patch={url.patchFilters}
        onClear={url.clearAll}
        sellers={selectableSellers}
        stores={accessibleStores}
        canFilterStore={isOwner}
        canFilterSeller={isManagerOrOwner}
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          {list.isError ? (
            <ErrorState onRetry={list.refetch} />
          ) : showEmpty ? (
            <EmptyState onClear={url.clearAll} />
          ) : (
            <OrdersTable
              orders={list.data}
              isLoading={list.isLoading}
              sort={sort}
              onSortChange={url.setSort}
              onRowClick={handleRowClick}
              sellers={sellersMap}
              customers={customersMap}
            />
          )}
        </div>
        <OrdersPagination
          page={page}
          pageSize={pageSize}
          total={list.total}
          onPageChange={url.setPage}
          onPageSizeChange={url.setPageSize}
        />
      </div>
    </div>
  );
}

function EmptyState({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground">
        <Icon icon="mdi:clipboard-list-outline" size={24} />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">Nenhum pedido encontrado</p>
        <p className="text-xs text-muted-foreground">
          Pedidos surgem automaticamente quando você converte um orçamento ou o SDR aceita um.
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={onClear}>
        Limpar filtros
      </Button>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-destructive/10 text-destructive">
        <Icon icon="mdi:alert-circle-outline" size={24} />
      </div>
      <p className="text-sm font-semibold text-foreground">Erro ao carregar</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Tentar novamente
      </Button>
    </div>
  );
}
