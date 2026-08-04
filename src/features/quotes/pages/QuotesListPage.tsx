import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ICustomer, ID, ISeller, QuoteStatus } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import {
  CockpitShell,
  ConsoleShell,
  ListStatStrip,
  ListStatusTabs,
  RowsShell,
  useListLayout,
  QUOTES_LIST_LAYOUT_KEY,
  type IStatusTab,
} from "@/shared/list-views";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentRole } from "@/features/rbac/hooks/useCurrentRole";
import { usePermission } from "@/features/rbac/hooks/usePermission";
import { useCurrentStore } from "@/features/multistore/hooks/useCurrentStore";
import { FETCH_ALL_PAGE_SIZE } from "@/providers/data";
import { useSellersProvider } from "@/providers/data/hooks/useSellersProvider";
import { useCustomersProvider } from "@/providers/data/hooks/useCustomersProvider";
import { ScrollProgressBar } from "@/features/shell/components/ScrollProgressBar";
import { QuotesHeader } from "../components/list/QuotesHeader";
import { QuotesFiltersBar } from "../components/list/QuotesFiltersBar";
import { QuotesTable } from "../components/list/QuotesTable";
import { QuotesTableRows } from "../components/list/QuotesTableRows";
import { QuotesPagination } from "../components/list/QuotesPagination";
import { QUOTE_STATUS_META } from "../components/QuoteStatusBadge";
import { quoteStatCells, quoteStatusCounts } from "../utils/quoteListStats";
import { useQuotesList } from "../hooks/useQuotesList";
import { useQuotesUrlState } from "../hooks/useQuotesUrlState";
import {
  OPTIONAL_COLUMNS,
  readVisibleOptional,
  writeVisibleOptional,
  type OptionalColumn,
} from "../utils/columns";

/** Status tab order + solid dot color (matches the badge palette). */
const STATUS_TAB_ORDER: QuoteStatus[] = [
  "rascunho",
  "enviado",
  "aceito",
  "recusado",
  "expirado",
  "convertido",
];
const STATUS_DOT: Record<QuoteStatus, string> = {
  rascunho: "bg-muted-foreground",
  enviado: "bg-blue-500",
  aceito: "bg-emerald-500",
  recusado: "bg-rose-500",
  expirado: "bg-orange-500",
  convertido: "bg-violet-500",
};

export function QuotesListPage() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const role = useCurrentRole();
  const canCreate = usePermission("quote", "create");
  const isManagerOrOwner = role === "Owner" || role === "Gestor";
  const isOwner = role === "Owner";
  const { accessibleStores } = useCurrentStore();

  const [layout, setLayout] = useListLayout(QUOTES_LIST_LAYOUT_KEY);
  const now = useMemo(() => new Date(), []);

  const url = useQuotesUrlState();
  const { filters, sort, page, pageSize } = url;

  const sellerIdLock = !isManagerOrOwner && currentUser?.sellerId ? currentUser.sellerId : null;

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

  const customersQuery = useQuery({
    queryKey: ["customers-for-quotes"] as const,
    queryFn: () => customersProvider.list({ pageSize: FETCH_ALL_PAGE_SIZE }),
    staleTime: 60_000,
  });
  const customersMap = useMemo<Map<ID, ICustomer>>(() => {
    const m = new Map<ID, ICustomer>();
    (customersQuery.data?.data ?? []).forEach((c) => m.set(c.id, c));
    return m;
  }, [customersQuery.data]);

  const list = useQuotesList(filters, sort, page, pageSize, {
    sellerIdLock,
    customersById: customersMap,
    sellersById: sellersMap,
  });

  // KPIs + contagens de abas, sobre o conjunto pré-status (allFiltered).
  const statCells = useMemo(() => quoteStatCells(list.allFiltered, now), [list.allFiltered, now]);
  const statusTabs = useMemo<IStatusTab[]>(() => {
    const counts = quoteStatusCounts(list.allFiltered);
    return [
      { key: "all", label: "Todos", count: list.allFiltered.length },
      ...STATUS_TAB_ORDER.map((s) => ({
        key: s,
        label: QUOTE_STATUS_META[s].label,
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
    url.patchFilters({ statuses: key === "all" ? [] : [key as QuoteStatus] });
  };

  const handleRowClick = (id: ID) => {
    void navigate({ to: "/app/orcamentos/$id", params: { id } });
  };
  const handleCreate = () => {
    void navigate({ to: "/app/orcamentos/novo" });
  };

  const hasResults = list.data.length > 0;
  const isFirstLoad = list.isLoading && !hasResults;
  const showEmpty = !isFirstLoad && !hasResults;

  // Actual scroll container: the Table wrapper inside QuotesTable (cockpit/
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
    <EmptyState canCreate={canCreate} onCreate={handleCreate} onClear={url.clearAll} />
  ) : layout === "rows" ? (
    <QuotesTableRows
      quotes={list.data}
      isLoading={list.isLoading}
      now={now}
      onRowClick={handleRowClick}
      sellers={sellersMap}
      customers={customersMap}
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
            <QuotesFiltersBar {...filtersProps} stacked />
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
        filters={<QuotesFiltersBar {...filtersProps} />}
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
        filters={<QuotesFiltersBar {...filtersProps} />}
        table={tableNode}
        progress={progressNode}
      />
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem-var(--shell-banner-offset,0px))] min-h-0 flex-col bg-background md:h-[calc(100vh-6rem-var(--shell-banner-offset,0px))]">
      <QuotesHeader
        total={list.total}
        searchValue={filters.search}
        onSearchChange={(q) => url.setSearch(q)}
        canCreate={canCreate}
        onCreate={handleCreate}
        layout={layout}
        onLayoutChange={setLayout}
      />
      {body}
      <QuotesPagination
        page={page}
        pageSize={pageSize}
        total={list.total}
        onPageChange={url.setPage}
        onPageSizeChange={url.setPageSize}
      />
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
