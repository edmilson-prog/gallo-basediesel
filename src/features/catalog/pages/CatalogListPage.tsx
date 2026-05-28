import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ID } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { useCurrentStore } from "@/features/multistore/hooks/useCurrentStore";
import { useCurrentRole } from "@/features/rbac/hooks/useCurrentRole";
import { usePermission } from "@/features/rbac/hooks/usePermission";
import { usePartsProvider } from "@/providers/data/hooks/usePartsProvider";
import { CatalogHeader } from "../components/list/CatalogHeader";
import { CatalogFiltersBar } from "../components/list/CatalogFiltersBar";
import { CatalogTable } from "../components/list/CatalogTable";
import { CatalogPagination } from "../components/list/CatalogPagination";
import { useCatalogList } from "../hooks/useCatalogList";
import { useCatalogUrlState } from "../hooks/useCatalogUrlState";
import { CATALOG_STRINGS } from "../i18n/pt-BR";

export function CatalogListPage() {
  const navigate = useNavigate();
  const role = useCurrentRole();
  const canCreate = usePermission("part", "create");
  const isOwner = role === "Owner";
  const { accessibleStores } = useCurrentStore();
  const partsProvider = usePartsProvider();

  const url = useCatalogUrlState();
  const { filters, sort, page, pageSize } = url;
  const list = useCatalogList(filters, sort, page, pageSize);

  // Auxiliary dataset for filter dropdowns — fetched once.
  const allParts = useQuery({
    queryKey: ["catalog-all-for-filters"] as const,
    queryFn: () => partsProvider.list({ pageSize: 2000 }),
    staleTime: 5 * 60_000,
  });

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

  const handleRowClick = (id: ID) => {
    void navigate({ to: "/app/catalogo/$id", params: { id } });
  };

  const handleCreate = () => {
    void navigate({ to: "/app/catalogo/novo" });
  };

  const hasResults = list.data.length > 0;
  const isFirstLoad = list.isLoading && !hasResults;
  const showEmpty = !isFirstLoad && !hasResults;

  return (
    <div className="flex h-[calc(100vh-4rem)] min-h-0 flex-col bg-background">
      <CatalogHeader
        total={list.total}
        searchValue={filters.search}
        onSearchChange={(q) => url.setSearch(q)}
        canCreate={canCreate}
        onCreate={handleCreate}
      />

      <CatalogFiltersBar
        filters={filters}
        patch={url.patchFilters}
        onClear={url.clearAll}
        manufacturerOptions={manufacturerOptions}
        vehicleBrandOptions={vehicleBrandOptions}
        vehicleModelOptions={vehicleModelOptions}
        vehicleYearOptions={vehicleYearOptions}
        stores={accessibleStores}
        canFilterStore={isOwner}
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1">
          {list.isError ? (
            <ErrorState onRetry={list.refetch} />
          ) : showEmpty ? (
            <EmptyState canCreate={canCreate} onCreate={handleCreate} onClear={url.clearAll} />
          ) : (
            <CatalogTable
              parts={list.data}
              isLoading={list.isLoading}
              sort={sort}
              onSortChange={url.setSort}
              onRowClick={handleRowClick}
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
