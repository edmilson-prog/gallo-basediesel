import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ICustomer, ID, ISeller, OrderStatus } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import {
  CockpitShell,
  ConsoleShell,
  ListStatStrip,
  ListStatusTabs,
  RowsShell,
  useListLayout,
  ORDERS_LIST_LAYOUT_KEY,
  type IStatusTab,
} from "@/shared/list-views";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentRole } from "@/features/rbac/hooks/useCurrentRole";
import { useCurrentStore } from "@/features/multistore/hooks/useCurrentStore";
import { FETCH_ALL_PAGE_SIZE } from "@/providers/data";
import { useSellersProvider } from "@/providers/data/hooks/useSellersProvider";
import { useCustomersProvider } from "@/providers/data/hooks/useCustomersProvider";
import { ScrollProgressBar } from "@/features/shell/components/ScrollProgressBar";
import { OrdersHeader } from "../components/list/OrdersHeader";
import { OrdersFiltersBar } from "../components/list/OrdersFiltersBar";
import { OrdersTable } from "../components/list/OrdersTable";
import { OrdersTableRows } from "../components/list/OrdersTableRows";
import { OrdersPagination } from "../components/list/OrdersPagination";
import { ORDER_STATUS_META } from "../components/OrderStatusBadge";
import { orderStatCells, orderStatusCounts } from "../utils/orderListStats";
import { useOrdersList } from "../hooks/useOrdersList";
import { useOrdersUrlState } from "../hooks/useOrdersUrlState";
import {
  OPTIONAL_COLUMNS,
  readVisibleOptional,
  writeVisibleOptional,
  type OptionalColumn,
} from "../utils/columns";

const STATUS_TAB_ORDER: OrderStatus[] = [
  "aguardando_pagamento",
  "pago_aguardando_envio",
  "em_separacao",
  "enviado",
  "entregue",
  "concluido",
  "cancelado",
  "devolvido",
];
const STATUS_DOT: Record<OrderStatus, string> = {
  aguardando_pagamento: "bg-amber-500",
  pago_aguardando_envio: "bg-blue-500",
  em_separacao: "bg-violet-500",
  enviado: "bg-sky-500",
  entregue: "bg-teal-500",
  concluido: "bg-emerald-500",
  cancelado: "bg-rose-500",
  devolvido: "bg-orange-500",
};

export function OrdersListPage() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const role = useCurrentRole();
  const isManagerOrOwner = role === "Owner" || role === "Gestor";
  const isOwner = role === "Owner";
  const { accessibleStores } = useCurrentStore();

  const [layout, setLayout] = useListLayout(ORDERS_LIST_LAYOUT_KEY);
  const now = useMemo(() => new Date(), []);

  const url = useOrdersUrlState();
  const { filters, sort, page, pageSize } = url;

  const sellerIdLock = !isManagerOrOwner && currentUser?.sellerId ? currentUser.sellerId : null;

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

  const customersQuery = useQuery({
    queryKey: ["customers-for-orders"] as const,
    queryFn: () => customersProvider.list({ pageSize: FETCH_ALL_PAGE_SIZE }),
    staleTime: 60_000,
  });
  const customersMap = useMemo<Map<ID, ICustomer>>(() => {
    const m = new Map<ID, ICustomer>();
    (customersQuery.data?.data ?? []).forEach((c) => m.set(c.id, c));
    return m;
  }, [customersQuery.data]);

  const list = useOrdersList(filters, sort, page, pageSize, {
    sellerIdLock,
    customersById: customersMap,
    sellersById: sellersMap,
  });

  const statCells = useMemo(() => orderStatCells(list.allFiltered, now), [list.allFiltered, now]);
  const statusTabs = useMemo<IStatusTab[]>(() => {
    const counts = orderStatusCounts(list.allFiltered);
    return [
      { key: "all", label: "Todos", count: list.allFiltered.length },
      ...STATUS_TAB_ORDER.map((s) => ({
        key: s,
        label: ORDER_STATUS_META[s].label,
        count: counts[s],
        dotClassName: STATUS_DOT[s],
      })),
    ];
  }, [list.allFiltered]);

  const activeStatusKey =
    filters.statuses.length === 1
      ? (filters.statuses[0] ?? "all")
      : filters.statuses.length === 0
        ? "all"
        : "";

  const onSelectStatus = (key: string) => {
    url.patchFilters({ statuses: key === "all" ? [] : [key as OrderStatus] });
  };

  const handleRowClick = (id: ID) => {
    void navigate({ to: "/app/pedidos/$id", params: { id } });
  };

  const hasResults = list.data.length > 0;
  const isFirstLoad = list.isLoading && !hasResults;
  const showEmpty = !isFirstLoad && !hasResults;

  // Actual scroll container: the Table wrapper inside OrdersTable (cockpit/
  // console layouts) or the RowsShell body (rows layout) — the progress line
  // receives whichever is mounted.
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null);

  // Column visibility (persisted in localStorage).
  const [visibleColumns, setVisibleColumns] = useState<Set<OptionalColumn>>(
    () => new Set(readVisibleOptional()),
  );
  const toggleColumn = useCallback((id: OptionalColumn) => {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const showAllColumns = useCallback(() => {
    setVisibleColumns(new Set(OPTIONAL_COLUMNS));
  }, []);
  useEffect(() => {
    // Persist in canonical column order.
    writeVisibleOptional(OPTIONAL_COLUMNS.filter((id) => visibleColumns.has(id)));
  }, [visibleColumns]);

  const tableNode = list.isError ? (
    <ErrorState onRetry={list.refetch} />
  ) : showEmpty ? (
    <EmptyState onClear={url.clearAll} />
  ) : layout === "rows" ? (
    <OrdersTableRows
      orders={list.data}
      isLoading={list.isLoading}
      onRowClick={handleRowClick}
      sellers={sellersMap}
      customers={customersMap}
    />
  ) : (
    <OrdersTable
      orders={list.data}
      isLoading={list.isLoading}
      sort={sort}
      onSortChange={url.setSort}
      onRowClick={handleRowClick}
      sellers={sellersMap}
      customers={customersMap}
      visibleColumns={visibleColumns}
      onToggleColumn={toggleColumn}
      onShowAllColumns={showAllColumns}
      scrollRef={setScrollEl}
    />
  );

  const filtersProps = {
    filters,
    patch: url.patchFilters,
    onClear: url.clearAll,
    sellers: selectableSellers,
    stores: accessibleStores,
    canFilterStore: isOwner,
    canFilterSeller: isManagerOrOwner,
  };

  // Progress line rendered at the seam between the fixed chrome and the
  // scrolling table (the shells' `progress` slot).
  const progressNode = <ScrollProgressBar container={scrollEl} />;

  let body: React.ReactNode;
  if (layout === "console") {
    body = (
      <ConsoleShell
        rail={
          <>
            <ListStatStrip cells={statCells} orientation="vertical" />
            <ListStatusTabs
              tabs={statusTabs}
              activeKey={activeStatusKey}
              onSelect={onSelectStatus}
              orientation="vertical"
            />
            <OrdersFiltersBar {...filtersProps} stacked />
          </>
        }
        table={tableNode}
        progress={progressNode}
      />
    );
  } else if (layout === "rows") {
    body = (
      <RowsShell
        strip={<ListStatStrip cells={statCells.slice(0, 3)} />}
        filters={<OrdersFiltersBar {...filtersProps} />}
        table={tableNode}
        scrollRef={setScrollEl}
        progress={progressNode}
      />
    );
  } else {
    body = (
      <CockpitShell
        strip={<ListStatStrip cells={statCells} />}
        tabs={
          <ListStatusTabs tabs={statusTabs} activeKey={activeStatusKey} onSelect={onSelectStatus} />
        }
        filters={<OrdersFiltersBar {...filtersProps} />}
        table={tableNode}
        progress={progressNode}
      />
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] min-h-0 flex-col bg-background md:h-[calc(100vh-6rem)]">
      <OrdersHeader
        total={list.total}
        searchValue={filters.search}
        onSearchChange={(q) => url.setSearch(q)}
        layout={layout}
        onLayoutChange={setLayout}
      />
      {body}
      <OrdersPagination
        page={page}
        pageSize={pageSize}
        total={list.total}
        onPageChange={url.setPage}
        onPageSizeChange={url.setPageSize}
      />
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
