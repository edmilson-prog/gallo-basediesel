import { useEffect, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ICustomer, ID, ISeller } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentRole } from "@/features/rbac/hooks/useCurrentRole";
import { usePermission } from "@/features/rbac/hooks/usePermission";
import { useCurrentStore } from "@/features/multistore/hooks/useCurrentStore";
import { useSellersProvider } from "@/providers/data/hooks/useSellersProvider";
import { useCustomersProvider } from "@/providers/data/hooks/useCustomersProvider";
import { QuotesHeader } from "../components/list/QuotesHeader";
import { QuotesFiltersBar } from "../components/list/QuotesFiltersBar";
import { QuotesTable } from "../components/list/QuotesTable";
import { QuotesPagination } from "../components/list/QuotesPagination";
import { useQuotesList } from "../hooks/useQuotesList";
import { useQuotesUrlState } from "../hooks/useQuotesUrlState";

export function QuotesListPage() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const role = useCurrentRole();
  const canCreate = usePermission("quote", "create");
  const isManagerOrOwner = role === "Owner" || role === "Gestor";
  const isOwner = role === "Owner";
  const { accessibleStores } = useCurrentStore();

  const url = useQuotesUrlState();
  const { filters, sort, page, pageSize } = url;

  // Vendedor — restrição: vê apenas seus orçamentos via sellerIdLock.
  const sellerIdLock =
    !isManagerOrOwner && currentUser?.sellerId ? currentUser.sellerId : null;

  const list = useQuotesList(filters, sort, page, pageSize, { sellerIdLock });

  const sellersProvider = useSellersProvider();
  const customersProvider = useCustomersProvider();

  const sellersQuery = useQuery({
    queryKey: ["sellers-for-quotes"] as const,
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
    list.data.forEach((q) => {
      if (q.customerId) ids.add(q.customerId);
    });
    return Array.from(ids);
  }, [list.data]);
  const customersQuery = useQuery({
    queryKey: ["customers-for-quotes", customerIds.length, customerIds.join(",")] as const,
    queryFn: () => customersProvider.list({ pageSize: 500 }),
    enabled: customerIds.length > 0,
    staleTime: 60_000,
  });
  const customersMap = useMemo<Map<ID, ICustomer>>(() => {
    const m = new Map<ID, ICustomer>();
    (customersQuery.data?.data ?? []).forEach((c) => m.set(c.id, c));
    return m;
  }, [customersQuery.data]);

  // Lock visual no filtro de vendedor para Vendedor.
  useEffect(() => {
    if (sellerIdLock && filters.sellerIds.length === 0) {
      // Não disparamos patch: o filtro provider já está restrito via sellerIdLock.
    }
  }, [sellerIdLock, filters.sellerIds]);

  const handleRowClick = (id: ID) => {
    void navigate({ to: "/app/orcamentos/$id", params: { id } });
  };

  const handleCreate = () => {
    void navigate({ to: "/app/orcamentos/novo" });
  };

  const hasResults = list.data.length > 0;
  const isFirstLoad = list.isLoading && !hasResults;
  const showEmpty = !isFirstLoad && !hasResults;

  return (
    <div className="flex h-[calc(100vh-4rem)] min-h-0 flex-col bg-background">
      <QuotesHeader
        total={list.total}
        searchValue={filters.search}
        onSearchChange={(q) => url.setSearch(q)}
        canCreate={canCreate}
        onCreate={handleCreate}
      />

      <QuotesFiltersBar
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
            <EmptyState
              canCreate={canCreate}
              onCreate={handleCreate}
              onClear={url.clearAll}
            />
          ) : (
            <QuotesTable
              quotes={list.data}
              isLoading={list.isLoading}
              sort={sort}
              onSortChange={url.setSort}
              onRowClick={handleRowClick}
              sellers={sellersMap}
              customers={customersMap}
            />
          )}
        </div>
        <QuotesPagination
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

function EmptyState({
  canCreate,
  onCreate,
  onClear,
}: {
  canCreate: boolean;
  onCreate: () => void;
  onClear: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground">
        <Icon icon="mdi:file-document-outline" size={24} />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">Nenhum orçamento encontrado</p>
        <p className="text-xs text-muted-foreground">
          Ajuste os filtros ou crie um orçamento manualmente.
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onClear}>
          Limpar filtros
        </Button>
        {canCreate && (
          <Button size="sm" onClick={onCreate}>
            <Icon icon="mdi:plus" size={16} />
            Orçamento
          </Button>
        )}
      </div>
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
