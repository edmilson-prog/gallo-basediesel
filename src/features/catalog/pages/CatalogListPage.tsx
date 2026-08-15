import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ID, IPart, PartCategory } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { useCurrentStore } from "@/features/multistore/hooks/useCurrentStore";
import { ScrollProgressBar } from "@/features/shell/components/ScrollProgressBar";
import { useCurrentRole } from "@/features/rbac/hooks/useCurrentRole";
import { usePermission } from "@/features/rbac/hooks/usePermission";
import { FETCH_ALL_PAGE_SIZE } from "@/providers/data";
import { usePartsProvider } from "@/providers/data/hooks/usePartsProvider";
import { CatalogHeader } from "../components/list/CatalogHeader";
import { CatalogCategoriesDrawer } from "../components/list/CatalogCategoriesDrawer";
import { CatalogCoverageBar } from "../components/list/CatalogCoverageBar";
import { CatalogFiltersBar } from "../components/list/CatalogFiltersBar";
import { CatalogTable } from "../components/list/CatalogTable";
import { CatalogGroupedList } from "../components/list/CatalogGroupedList";
import { CatalogBulkBar } from "../components/list/CatalogBulkBar";
import { CatalogPagination } from "../components/list/CatalogPagination";
import { useCatalogList } from "../hooks/useCatalogList";
import { useCatalogTurnover } from "../hooks/useCatalogTurnover";
import { useCatalogUrlState } from "../hooks/useCatalogUrlState";
import { countCoverage } from "../utils/completeness";
import { buildRestockSummary } from "../utils/restock";
import {
  OPTIONAL_COLUMNS,
  PROFITABILITY_COLUMNS,
  readVisibleOptional,
  writeVisibleOptional,
  type OptionalColumn,
} from "../utils/columns";
import { CATALOG_STRINGS } from "../i18n/pt-BR";

/** Parts updated per round in a bulk action — keeps the provider from being flooded. */
const BULK_CHUNK_SIZE = 5;

export function CatalogListPage() {
  const navigate = useNavigate();
  const role = useCurrentRole();
  const canCreate = usePermission("part", "create");
  const canUpdate = usePermission("part", "edit");
  /**
   * Cost, margin and turnover are commercial intelligence, not catalog data —
   * the same gate that guards the Rentabilidade screen guards them here, so a
   * Vendedor never sees what the shop pays for a part.
   */
  const canSeeMargin = usePermission("profitability", "view");
  const isOwner = role === "Owner";
  const { accessibleStores, currentStoreId } = useCurrentStore();
  const partsProvider = usePartsProvider();
  const queryClient = useQueryClient();

  const url = useCatalogUrlState();
  const { filters, sort, view, page, pageSize } = url;

  // Column visibility (persisted in localStorage).
  const [storedColumns, setStoredColumns] = useState<Set<OptionalColumn>>(
    () => new Set(readVisibleOptional()),
  );

  /** Columns this role may even be offered. */
  const availableColumns = useMemo(
    () =>
      canSeeMargin
        ? OPTIONAL_COLUMNS
        : OPTIONAL_COLUMNS.filter((id) => !PROFITABILITY_COLUMNS.includes(id)),
    [canSeeMargin],
  );

  // A stored preference can never widen access: margin/turnover are dropped for
  // roles without the profitability permission, whatever localStorage says.
  const visibleColumns = useMemo(
    () => new Set([...storedColumns].filter((id) => availableColumns.includes(id))),
    [storedColumns, availableColumns],
  );

  // Turnover costs a full orders window, so it only loads with its column on.
  const turnoverEnabled = visibleColumns.has("turnover");
  const turnover = useCatalogTurnover(turnoverEnabled, currentStoreId ?? undefined);

  const list = useCatalogList(filters, sort, page, pageSize, turnover.index);

  // Auxiliary dataset for filter dropdowns and the coverage counts — fetched once.
  const allParts = useQuery({
    queryKey: ["catalog-all-for-filters"] as const,
    queryFn: () => partsProvider.list({ pageSize: FETCH_ALL_PAGE_SIZE }),
    staleTime: 5 * 60_000,
  });

  /** Coverage describes the whole base, not the filtered page. */
  const coverageCounts = useMemo(() => {
    if (!allParts.data) return null;
    return countCoverage(allParts.data.data);
  }, [allParts.data]);

  const manufacturerOptions = useMemo(() => {
    const set = new Set<string>();
    (allParts.data?.data ?? []).forEach((p) => set.add(p.brand));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [allParts.data]);

  const vehicleBrandOptions = useMemo(() => {
    const set = new Set<string>();
    (allParts.data?.data ?? []).forEach((p) =>
      p.applications.forEach((a) => set.add(a.vehicleBrand)),
    );
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [allParts.data]);

  const vehicleModelOptions = useMemo(() => {
    if (!filters.vehicleBrand) return [];
    const set = new Set<string>();
    (allParts.data?.data ?? []).forEach((p) =>
      p.applications.forEach((a) => {
        if (a.vehicleBrand === filters.vehicleBrand) set.add(a.vehicleModel);
      }),
    );
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [allParts.data, filters.vehicleBrand]);

  const vehicleYearOptions = useMemo(() => {
    const set = new Set<number>();
    (allParts.data?.data ?? []).forEach((p) =>
      p.applications.forEach((a) => {
        for (let y = a.yearStart; y <= a.yearEnd; y += 1) set.add(y);
      }),
    );
    return Array.from(set).sort((a, b) => b - a);
  }, [allParts.data]);

  const toggleColumn = useCallback((id: OptionalColumn) => {
    setStoredColumns((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const showAllColumns = useCallback(() => {
    setStoredColumns(new Set(availableColumns));
  }, [availableColumns]);

  useEffect(() => {
    // Persist in canonical column order.
    writeVisibleOptional(OPTIONAL_COLUMNS.filter((id) => visibleColumns.has(id)));
  }, [visibleColumns]);

  /* ── Bulk selection ───────────────────────────────────────────────────── */

  const [selectedIds, setSelectedIds] = useState<Set<ID>>(() => new Set());

  const toggleRow = useCallback((id: ID) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /** Header checkbox: clears when everything visible is already selected. */
  const toggleVisible = useCallback((visible: IPart[]) => {
    setSelectedIds((prev) => {
      const allSelected = visible.length > 0 && visible.every((part) => prev.has(part.id));
      const next = new Set(prev);
      for (const part of visible) {
        if (allSelected) next.delete(part.id);
        else next.add(part.id);
      }
      return next;
    });
  }, []);

  const selectMany = useCallback((parts: IPart[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const part of parts) next.add(part.id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  // Selection follows the filtered set, so it survives paging but never keeps
  // rows the current filters have excluded.
  const selectedParts = useMemo(
    () => list.all.filter((part) => selectedIds.has(part.id)),
    [list.all, selectedIds],
  );

  const applyBulk = useCallback(
    async (ids: ID[], patch: Partial<IPart>): Promise<number> => {
      let failed = 0;
      for (let i = 0; i < ids.length; i += BULK_CHUNK_SIZE) {
        const chunk = ids.slice(i, i + BULK_CHUNK_SIZE);
        const results = await Promise.allSettled(
          chunk.map((id) => partsProvider.update(id, patch)),
        );
        failed += results.filter((result) => result.status === "rejected").length;
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["catalog-list"] }),
        queryClient.invalidateQueries({ queryKey: ["catalog-all-for-filters"] }),
      ]);
      return failed;
    },
    [partsProvider, queryClient],
  );

  /* ── Row actions ──────────────────────────────────────────────────────── */

  const handleRestock = useCallback(async (part: IPart) => {
    try {
      await navigator.clipboard.writeText(buildRestockSummary(part));
      toast.success(CATALOG_STRINGS.detail.stockAlert.copied, {
        icon: <Icon icon="mdi:content-copy" size={16} />,
      });
    } catch {
      toast.error(CATALOG_STRINGS.detail.stockAlert.copyError);
    }
  }, []);

  /** The honest follow-up to "desativar?" is to stage the part for the bulk bar. */
  const handleSuggestDeactivate = useCallback((part: IPart) => {
    setSelectedIds((prev) => new Set(prev).add(part.id));
    toast.info(CATALOG_STRINGS.cells.suggestDeactivateTitle, {
      icon: <Icon icon="mdi:archive-arrow-down-outline" size={16} />,
    });
  }, []);

  /* ── Category manager ─────────────────────────────────────────────────── */

  const [categoriesOpen, setCategoriesOpen] = useState(false);

  /** "Triar" — jump to the grouped view, filtered to the uncategorised queue. */
  const handleTriage = useCallback(() => {
    url.setViewAndCoverage("grouped", "noCategory");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url.setViewAndCoverage]);

  /** Reassigns a whole family — the honest form of "merge" while slugs are the join key. */
  const handleMoveParts = useCallback(
    (to: PartCategory, moving: IPart[]) =>
      applyBulk(
        moving.map((part) => part.id),
        { category: to },
      ),
    [applyBulk],
  );

  const handleRowClick = (id: ID) => {
    void navigate({ to: "/app/catalogo/$id", params: { id } });
  };

  const handleCreate = () => {
    void navigate({ to: "/app/catalogo/novo" });
  };

  const handleClearAll = useCallback(() => {
    clearSelection();
    url.clearAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearSelection, url.clearAll]);

  const hasResults = list.data.length > 0;
  const isFirstLoad = list.isLoading && !hasResults;
  const showEmpty = !isFirstLoad && !hasResults;

  // Scroll container lives inside the list body (sibling of the header block),
  // so the progress line receives it explicitly instead of walking ancestors.
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null);

  return (
    <div className="flex h-[calc(100vh-4rem-var(--shell-banner-offset,0px))] min-h-0 flex-col bg-background md:h-[calc(100vh-6rem-var(--shell-banner-offset,0px))]">
      {/* Fixed header block — the progress line rides its bottom edge, right
          where the list starts scrolling. */}
      <div className="relative">
        <CatalogHeader
          total={list.total}
          searchValue={filters.search}
          onSearchChange={(q) => url.setSearch(q)}
          canCreate={canCreate}
          onCreate={handleCreate}
          onOpenCategories={() => setCategoriesOpen(true)}
        />

        <CatalogCoverageBar
          counts={coverageCounts}
          active={filters.coverage}
          onChange={url.setCoverage}
          isLoading={allParts.isLoading}
        />

        <CatalogFiltersBar
          filters={filters}
          patch={url.patchFilters}
          onClear={handleClearAll}
          manufacturerOptions={manufacturerOptions}
          vehicleBrandOptions={vehicleBrandOptions}
          vehicleModelOptions={vehicleModelOptions}
          vehicleYearOptions={vehicleYearOptions}
          stores={accessibleStores}
          canFilterStore={isOwner}
          view={view}
          onViewChange={url.setView}
        />

        <ScrollProgressBar container={scrollEl} />
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1">
          {list.isError ? (
            <ErrorState onRetry={list.refetch} />
          ) : showEmpty ? (
            <EmptyState canCreate={canCreate} onCreate={handleCreate} onClear={handleClearAll} />
          ) : view === "grouped" ? (
            <CatalogGroupedList
              parts={list.data}
              isLoading={list.isLoading}
              onRowClick={handleRowClick}
              scrollRef={setScrollEl}
              selectedIds={selectedIds}
              onToggleRow={toggleRow}
              onSelectMany={selectMany}
              canSeeMargin={canSeeMargin}
              turnoverIndex={turnover.index}
              isTurnoverLoading={turnover.isLoading}
              onRestock={handleRestock}
              onSuggestDeactivate={handleSuggestDeactivate}
            />
          ) : (
            <CatalogTable
              parts={list.data}
              isLoading={list.isLoading}
              sort={sort}
              onSortChange={url.setSort}
              onRowClick={handleRowClick}
              visibleColumns={visibleColumns}
              onToggleColumn={toggleColumn}
              onShowAllColumns={showAllColumns}
              availableColumns={availableColumns}
              scrollRef={setScrollEl}
              selectedIds={selectedIds}
              onToggleRow={toggleRow}
              onToggleVisible={toggleVisible}
              turnoverIndex={turnover.index}
              isTurnoverLoading={turnover.isLoading}
              onRestock={handleRestock}
              onSuggestDeactivate={handleSuggestDeactivate}
            />
          )}
        </div>
        <CatalogPagination
          page={page}
          pageSize={pageSize}
          total={list.total}
          onPageChange={url.setPage}
          onPageSizeChange={url.setPageSize}
        />
      </div>

      <CatalogBulkBar
        selected={selectedParts}
        onClear={clearSelection}
        onApply={applyBulk}
        canUpdate={canUpdate}
      />

      <CatalogCategoriesDrawer
        open={categoriesOpen}
        onOpenChange={setCategoriesOpen}
        parts={allParts.data?.data ?? []}
        canManage={isOwner}
        onTriage={handleTriage}
        onMoveParts={handleMoveParts}
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
        <Icon icon="mdi:package-variant-closed-remove" size={24} />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{CATALOG_STRINGS.list.emptyTitle}</p>
        <p className="text-xs text-muted-foreground">{CATALOG_STRINGS.list.emptyDescription}</p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onClear}>
          {CATALOG_STRINGS.filters.clear}
        </Button>
        {canCreate && (
          <Button size="sm" onClick={onCreate}>
            <Icon icon="mdi:plus" size={16} />
            {CATALOG_STRINGS.list.emptyCreate}
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
      <p className="text-sm font-semibold text-foreground">{CATALOG_STRINGS.list.errorTitle}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        {CATALOG_STRINGS.list.retry}
      </Button>
    </div>
  );
}
