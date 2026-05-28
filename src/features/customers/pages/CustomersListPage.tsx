import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useQueries } from "@tanstack/react-query";
import type { ICustomer, ICustomerSegment, ID, ISeller } from "@/shared/types";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentStore } from "@/features/multistore/hooks/useCurrentStore";
import { useCurrentRole } from "@/features/rbac/hooks/useCurrentRole";
import { usePermission } from "@/features/rbac/hooks/usePermission";
import { useCustomersProvider } from "@/providers/data/hooks/useCustomersProvider";
import { useSellersProvider } from "@/providers/data/hooks/useSellersProvider";
import { recordAuditLogSync } from "@/providers/data/auditLogger";
import { hashHue, initialsFrom, avatarColors } from "@/shared/utils/avatar";
import { CustomerProfile } from "../components/CustomerProfile";
import { CustomersFiltersBar } from "../components/list/CustomersFiltersBar";
import { CustomersHeader } from "../components/list/CustomersHeader";
import { CustomersPagination } from "../components/list/CustomersPagination";
import { CustomersTable, type ISellerLookupEntry } from "../components/list/CustomersTable";
import { BulkActionsBar } from "../components/list/BulkActionsBar";
import { ColumnsConfigModal } from "../components/list/ColumnsConfigModal";
import { SaveSegmentModal } from "../components/list/SaveSegmentModal";
import { ManageSegmentsModal } from "../components/list/ManageSegmentsModal";
import { NewCustomerModal } from "../components/list/NewCustomerModal";
import { AddTagModal } from "../components/list/bulk-actions/AddTagModal";
import { RemoveTagModal } from "../components/list/bulk-actions/RemoveTagModal";
import { NewPermanentBatchTransferModal } from "@/features/carteira/components/NewPermanentBatchTransferModal";
import { useCustomersUrlState } from "../hooks/useCustomersUrlState";
import { useCustomersList } from "../hooks/useCustomersList";
import { useSegments } from "../hooks/useSegments";
import {
  EMPTY_FILTERS,
  filtersEqual,
  toListParams,
  type ICustomersListFilters,
} from "../utils/listFilters";
import {
  DEFAULT_VISIBLE_OPTIONAL,
  readVisibleOptional,
  writeVisibleOptional,
  type OptionalColumn,
} from "../utils/columns";

export function CustomersListPage() {
  const { currentUser } = useAuth();
  const { currentStore, accessibleStores, currentStoreId } = useCurrentStore();
  const role = useCurrentRole();
  const canCreateCustomer = usePermission("customer", "create");
  const canEditCustomer = usePermission("customer", "edit");
  const canCreateTransfer = usePermission("transfer", "create");
  const canExport = usePermission("customer", "edit", "store");
  const isManagerOrOwner = role === "Owner" || role === "Gestor";
  const isOwner = role === "Owner";
  const navigate = useNavigate();

  const url = useCustomersUrlState();
  const { filters, sort, page, pageSize, segmentId, selectedId } = url;

  const list = useCustomersList(filters, sort, page, pageSize);
  const segments = useSegments();
  const sellersProvider = useSellersProvider();
  const customersProvider = useCustomersProvider();

  // Carrega lista de vendedores aplicáveis (scoped à loja atual).
  const sellersQuery = useQueries({
    queries: [
      {
        queryKey: ["sellers-list", currentStoreId] as const,
        queryFn: () =>
          sellersProvider.list({
            storeId: currentStoreId ?? undefined,
            active: true,
          }),
        staleTime: 60_000,
      },
    ],
  })[0];
  const sellers: ISeller[] = useMemo(() => sellersQuery.data ?? [], [sellersQuery.data]);

  // Vendedores selecionáveis pelo usuário (Vendedor vê apenas a si mesmo).
  const selectableSellers = useMemo(() => {
    if (!isManagerOrOwner && currentUser?.sellerId) {
      return sellers.filter((s) => s.id === currentUser.sellerId);
    }
    return sellers;
  }, [isManagerOrOwner, currentUser?.sellerId, sellers]);

  // Tags disponíveis (extraídas dos clientes carregados na página + seed).
  const availableTags = useMemo(() => {
    const set = new Set<string>();
    list.data.forEach((c) => c.tags.forEach((t) => set.add(t)));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [list.data]);

  // Lookup vendedor → display (para coluna "Vendedor").
  const sellersById = useMemo<Map<ID, ISellerLookupEntry>>(() => {
    const map = new Map<ID, ISellerLookupEntry>();
    sellers.forEach((s) => {
      const hue = hashHue(s.id);
      const colors = avatarColors(hue);
      map.set(s.id, {
        initials: initialsFrom(s.fullName),
        name: s.fullName,
        hue,
        bg: colors.bg,
        fg: colors.fg,
      });
    });
    return map;
  }, [sellers]);

  // Vendedor é forçado a ver só sua carteira (RBAC).
  useEffect(() => {
    if (!isManagerOrOwner && currentUser?.sellerId) {
      if (filters.sellerIds.length !== 1 || filters.sellerIds[0] !== currentUser.sellerId) {
        url.patchFilters({ sellerIds: [currentUser.sellerId] });
      }
    }
  }, [isManagerOrOwner, currentUser?.sellerId, filters.sellerIds, url]);

  // --- Multi-select ---
  const [selectedIds, setSelectedIds] = useState<Set<ID>>(new Set());
  const [selectAllScope, setSelectAllScope] = useState<"page" | "filtered">("page");

  const toggleSelected = useCallback((id: ID, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
    setSelectAllScope("page");
  }, []);

  const toggleAllInPage = useCallback(
    (checked: boolean) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (checked) {
          list.data.forEach((c) => next.add(c.id));
        } else {
          list.data.forEach((c) => next.delete(c.id));
        }
        return next;
      });
      setSelectAllScope("page");
    },
    [list.data],
  );

  const handleSelectAllFiltered = useCallback(async () => {
    // Recarrega todos os clientes filtrados (até 500) para selecionar.
    const all = await customersProvider.list({
      ...toListParams(filters, sort, 1, 500),
      pageSize: 500,
    });
    setSelectedIds(new Set(all.data.map((c) => c.id)));
    setSelectAllScope("filtered");
  }, [customersProvider, filters, sort]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setSelectAllScope("page");
  }, []);

  // Resetar seleção quando os filtros mudam significativamente.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [filters, sort, page, pageSize]);

  // --- Configuração de colunas ---
  const [visibleOptional, setVisibleOptional] = useState<OptionalColumn[]>(() => {
    if (typeof window === "undefined") return DEFAULT_VISIBLE_OPTIONAL;
    return readVisibleOptional();
  });
  const [columnsModalOpen, setColumnsModalOpen] = useState(false);

  // --- Segmentações ---
  const [saveSegmentOpen, setSaveSegmentOpen] = useState(false);
  const [manageSegmentsOpen, setManageSegmentsOpen] = useState(false);
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [addTagOpen, setAddTagOpen] = useState(false);
  const [removeTagOpen, setRemoveTagOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);

  const activeSegment: ICustomerSegment | null = useMemo(() => {
    if (!segmentId) return null;
    return segments.all.find((s) => s.id === segmentId) ?? null;
  }, [segmentId, segments.all]);

  // Se a segmentação ativa foi removida, limpa.
  useEffect(() => {
    if (!segmentId) return;
    if (segments.isLoading) return;
    if (!activeSegment) {
      url.setSegmentId(null);
      toast.info("Segmentação ativa foi removida — voltando ao padrão.");
    }
  }, [segmentId, activeSegment, segments.isLoading, url]);

  const segmentFiltersAsList = useMemo<ICustomersListFilters | null>(() => {
    if (!activeSegment) return null;
    const raw = activeSegment.filters as Partial<ICustomersListFilters> & {
      [key: string]: unknown;
    };
    // Segmentações antigas usam DSL diferente — preservamos como base e
    // sobrepomos somente os campos compatíveis.
    return {
      ...EMPTY_FILTERS,
      statuses: Array.isArray(raw.statuses) ? (raw.statuses as ICustomer["status"][]) : [],
      type: raw.type === "B2B" || raw.type === "B2C" ? raw.type : "all",
      abcClasses: Array.isArray(raw.abcClasses) ? raw.abcClasses : [],
      tags: Array.isArray(raw.tags) ? raw.tags : [],
      sellerIds: Array.isArray(raw.sellerIds) ? raw.sellerIds : [],
      recencyBuckets: Array.isArray(raw.recencyBuckets) ? raw.recencyBuckets : [],
      vehicleBrands: Array.isArray(raw.vehicleBrands) ? raw.vehicleBrands : [],
      storeIds: Array.isArray(raw.storeIds) ? raw.storeIds : [],
      positivation:
        raw.positivation === "positivado" || raw.positivation === "nao_positivado"
          ? raw.positivation
          : "all",
      hasB2BPortal: raw.hasB2BPortal === true,
      search: typeof raw.search === "string" ? raw.search : "",
    };
  }, [activeSegment]);

  const hasUnsavedFilters = useMemo(() => {
    if (!segmentFiltersAsList) return false;
    return !filtersEqual(segmentFiltersAsList, { ...filters, search: filters.search });
  }, [segmentFiltersAsList, filters]);

  const hasAnyFilter = useMemo(() => {
    return !filtersEqual(filters, EMPTY_FILTERS) || filters.search.trim().length > 0;
  }, [filters]);

  // --- Drill-down: cliente selecionado ---
  const selectedCustomer = useMemo<ICustomer | null>(() => {
    if (!selectedId) return null;
    return list.data.find((c) => c.id === selectedId) ?? null;
  }, [selectedId, list.data]);

  const handleSelectDetail = useCallback(
    (id: ID) => {
      if (typeof window !== "undefined" && window.innerWidth < 768) {
        void navigate({ to: "/app/clientes/$id", params: { id } });
        return;
      }
      url.setSelectedId(id);
    },
    [navigate, url],
  );

  // Tags presentes nos selecionados (para o RemoveTag modal).
  const tagsPresentInSelection = useMemo(() => {
    const set = new Set<string>();
    list.data.forEach((c) => {
      if (selectedIds.has(c.id)) c.tags.forEach((t) => set.add(t));
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [list.data, selectedIds]);

  // Clientes selecionados (objeto completo) — usado pelo modal de transferência em lote.
  const selectedCustomers = useMemo(
    () => list.data.filter((c) => selectedIds.has(c.id)),
    [list.data, selectedIds],
  );

  // --- Ações ---
  const handleApplySegment = useCallback(
    (segment: ICustomerSegment) => {
      const raw = segment.filters as Partial<ICustomersListFilters>;
      const next: ICustomersListFilters = {
        ...EMPTY_FILTERS,
        statuses: Array.isArray(raw.statuses) ? (raw.statuses as ICustomer["status"][]) : [],
        type: raw.type === "B2B" || raw.type === "B2C" ? raw.type : ("all" as const),
        abcClasses: Array.isArray(raw.abcClasses) ? raw.abcClasses : [],
        tags: Array.isArray(raw.tags) ? raw.tags : [],
        sellerIds: Array.isArray(raw.sellerIds) ? raw.sellerIds : [],
        recencyBuckets: Array.isArray(raw.recencyBuckets) ? raw.recencyBuckets : [],
        vehicleBrands: Array.isArray(raw.vehicleBrands) ? raw.vehicleBrands : [],
        storeIds: Array.isArray(raw.storeIds) ? raw.storeIds : [],
        positivation:
          raw.positivation === "positivado" || raw.positivation === "nao_positivado"
            ? raw.positivation
            : ("all" as const),
        hasB2BPortal: raw.hasB2BPortal === true,
        search: typeof raw.search === "string" ? raw.search : "",
      };
      url.setFilters(next);
      url.setSegmentId(segment.id);
      toast.success(`Segmentação aplicada: ${segment.name}`);
    },
    [url],
  );

  const handleSaveSegment = useCallback(
    async (args: { name: string; description?: string; scope: "private" | "shared" }) => {
      const created = await segments.create({
        ...args,
        filters: { ...filters },
      });
      url.setSegmentId(created.id);
      toast.success("Segmentação salva.");
    },
    [segments, filters, url],
  );

  const handleSaveChanges = useCallback(async () => {
    if (!activeSegment) return;
    await segments.update({
      id: activeSegment.id,
      patch: { filters: { ...filters } },
    });
    toast.success("Alterações salvas na segmentação.");
  }, [activeSegment, segments, filters]);

  const handleUpdateSegment = useCallback(
    async (id: ID, patch: { name?: string; scope?: "private" | "shared" }) => {
      await segments.update({ id, patch });
      toast.success("Segmentação atualizada.");
    },
    [segments],
  );

  const handleDeleteSegment = useCallback(
    async (id: ID) => {
      await segments.remove(id);
      if (segmentId === id) url.setSegmentId(null);
      toast.success("Segmentação excluída.");
    },
    [segments, segmentId, url],
  );

  const handleAddTag = useCallback(
    async (tagsToAdd: string[]) => {
      const ids = Array.from(selectedIds);
      let updated = 0;
      for (const id of ids) {
        const customer = list.data.find((c) => c.id === id);
        if (!customer) continue;
        const merged = Array.from(new Set([...customer.tags, ...tagsToAdd]));
        await customersProvider.update(id, { tags: merged });
        updated += 1;
      }
      recordAuditLogSync({
        actorId: currentUser?.id ?? "system",
        action: "bulk_add_tag",
        resource: "customer",
        resourceId: ids.join(","),
        after: { tags: tagsToAdd, affected: ids.length, summary: true },
      });
      await list.invalidate();
      toast.success(`${updated} ${updated === 1 ? "cliente atualizado" : "clientes atualizados"}.`);
    },
    [selectedIds, list, customersProvider, currentUser?.id],
  );

  const handleRemoveTag = useCallback(
    async (tagsToRemove: string[]) => {
      const ids = Array.from(selectedIds);
      let updated = 0;
      for (const id of ids) {
        const customer = list.data.find((c) => c.id === id);
        if (!customer) continue;
        const filtered = customer.tags.filter((t) => !tagsToRemove.includes(t));
        if (filtered.length !== customer.tags.length) {
          await customersProvider.update(id, { tags: filtered });
          updated += 1;
        }
      }
      recordAuditLogSync({
        actorId: currentUser?.id ?? "system",
        action: "bulk_remove_tag",
        resource: "customer",
        resourceId: ids.join(","),
        after: { tags: tagsToRemove, affected: updated, summary: true },
      });
      await list.invalidate();
      toast.success(`${updated} clientes atualizados.`);
    },
    [selectedIds, list, customersProvider, currentUser?.id],
  );

  const handleMarkDormant = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Marcar ${ids.length} clientes como dormentes?`)
    ) {
      return;
    }
    for (const id of ids) {
      await customersProvider.update(id, { status: "dormente" });
    }
    recordAuditLogSync({
      actorId: currentUser?.id ?? "system",
      action: "bulk_mark_dormant",
      resource: "customer",
      resourceId: ids.join(","),
      after: { status: "dormente", affected: ids.length, summary: true },
    });
    await list.invalidate();
    toast.success(`${ids.length} clientes marcados como dormentes.`);
  }, [selectedIds, list, customersProvider, currentUser?.id]);

  const handleCreateCustomer = useCallback(
    async (input: Omit<ICustomer, "id" | "createdAt" | "notes">) => {
      const created = await customersProvider.create(input);
      await list.invalidate();
      url.setSelectedId(created.id);
      toast.success("Cliente criado.");
    },
    [customersProvider, list, url],
  );

  const showEmptyState = !list.isLoading && list.data.length === 0;

  return (
    <div className="flex h-[calc(100vh-4rem)] min-h-0 flex-col bg-background">
      <CustomersHeader
        total={list.total}
        searchValue={filters.search}
        onSearchChange={(q) => url.setSearch(q)}
        canCreateCustomer={canCreateCustomer}
        onCreateCustomer={() => setNewCustomerOpen(true)}
        privateSegments={segments.privateOnes}
        sharedSegments={segments.shared}
        activeSegmentId={activeSegment?.id ?? null}
        activeSegmentName={activeSegment?.name ?? null}
        hasFilters={hasAnyFilter}
        hasUnsavedFilters={hasUnsavedFilters}
        onApplySegment={handleApplySegment}
        onSaveAsNew={() => setSaveSegmentOpen(true)}
        onSaveChanges={() => void handleSaveChanges()}
        onManageSegments={() => setManageSegmentsOpen(true)}
        onClearSegment={() => url.setSegmentId(null)}
        onConfigureColumns={() => setColumnsModalOpen(true)}
      />

      <CustomersFiltersBar
        filters={filters}
        patch={(p) => url.patchFilters(p)}
        onClear={() => url.clearAll()}
        sellers={selectableSellers}
        stores={accessibleStores}
        availableTags={availableTags}
        canFilterStore={isOwner}
        canFilterSeller={isManagerOrOwner}
        isManagerOrOwner={isManagerOrOwner}
      />

      <BulkActionsBar
        count={selectedIds.size}
        totalFiltered={list.total}
        isPageScope={selectAllScope === "page"}
        canTransfer={canCreateTransfer && isManagerOrOwner}
        canExport={canExport}
        onClear={clearSelection}
        onSelectAllFiltered={() => void handleSelectAllFiltered()}
        onAddTag={() => setAddTagOpen(true)}
        onRemoveTag={() => setRemoveTagOpen(true)}
        onTransferSeller={() => setTransferOpen(true)}
        onMarkDormant={() => void handleMarkDormant()}
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[3fr_2fr]">
        <div className="flex min-h-0 flex-col overflow-hidden border-r border-border">
          <div className="flex-1 overflow-y-auto">
            {showEmptyState ? (
              <EmptyState
                hasFilters={hasAnyFilter || filters.search.trim().length > 0}
                hasSearch={filters.search.trim().length > 0}
                searchTerm={filters.search}
                onClear={() => url.clearAll()}
                onCreate={canCreateCustomer ? () => setNewCustomerOpen(true) : undefined}
              />
            ) : list.isError ? (
              <ErrorState onRetry={list.refetch} />
            ) : (
              <CustomersTable
                customers={list.data}
                isLoading={list.isLoading}
                isFetching={list.isFetching}
                visibleOptional={visibleOptional}
                selectedIds={selectedIds}
                onToggleSelected={toggleSelected}
                onToggleAllInPage={toggleAllInPage}
                selectedDetailId={selectedId}
                onSelectDetail={handleSelectDetail}
                sort={sort}
                onSortChange={url.setSort}
                searchTerm={filters.search}
                sellersById={sellersById}
              />
            )}
          </div>
          <CustomersPagination
            page={page}
            pageSize={pageSize}
            total={list.total}
            onPageChange={url.setPage}
            onPageSizeChange={url.setPageSize}
          />
        </div>

        <div className={cn("hidden min-h-0 lg:block")}>
          {selectedCustomer ? (
            <div className="h-full overflow-y-auto">
              <CustomerProfile
                customerId={selectedCustomer.id}
                variant="column"
                className="h-full"
              />
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-12 text-center">
              <div className="grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground">
                <Icon icon="mdi:account-eye-outline" size={24} />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">Selecione um cliente</p>
                <p className="text-xs text-muted-foreground">
                  Clique em uma linha para ver os detalhes completos da ficha aqui.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <ColumnsConfigModal
        open={columnsModalOpen}
        visible={visibleOptional}
        onClose={() => setColumnsModalOpen(false)}
        onChange={(next) => {
          setVisibleOptional(next);
          writeVisibleOptional(next);
        }}
      />

      <SaveSegmentModal
        open={saveSegmentOpen}
        canCreateShared={isManagerOrOwner}
        onClose={() => setSaveSegmentOpen(false)}
        onSubmit={handleSaveSegment}
      />

      <ManageSegmentsModal
        open={manageSegmentsOpen}
        segments={segments.all}
        canEditShared={isManagerOrOwner}
        currentUserId={currentUser?.id ?? null}
        onClose={() => setManageSegmentsOpen(false)}
        onUpdate={handleUpdateSegment}
        onDelete={handleDeleteSegment}
      />

      <NewCustomerModal
        open={newCustomerOpen}
        sellers={selectableSellers}
        defaultSellerId={isManagerOrOwner ? null : (currentUser?.sellerId ?? null)}
        sellerLocked={!isManagerOrOwner}
        storeId={currentStore?.id ?? currentStoreId ?? "store-matriz"}
        onClose={() => setNewCustomerOpen(false)}
        onSubmit={handleCreateCustomer}
      />

      {canEditCustomer && (
        <AddTagModal
          open={addTagOpen}
          affectedCount={selectedIds.size}
          availableTags={availableTags}
          onClose={() => setAddTagOpen(false)}
          onSubmit={handleAddTag}
        />
      )}

      {canEditCustomer && (
        <RemoveTagModal
          open={removeTagOpen}
          presentTags={tagsPresentInSelection}
          affectedCount={selectedIds.size}
          onClose={() => setRemoveTagOpen(false)}
          onSubmit={handleRemoveTag}
        />
      )}

      {canCreateTransfer && isManagerOrOwner && (
        <NewPermanentBatchTransferModal
          open={transferOpen}
          customers={selectedCustomers}
          sellers={sellers}
          storeId={currentStoreId ?? "store-matriz"}
          currentUserId={currentUser?.id ?? "system"}
          onClose={() => setTransferOpen(false)}
          onCreated={async () => {
            await list.invalidate();
            setSelectedIds(new Set());
          }}
        />
      )}
    </div>
  );
}

interface IEmptyStateProps {
  hasFilters: boolean;
  hasSearch: boolean;
  searchTerm: string;
  onClear: () => void;
  onCreate?: () => void;
}

function EmptyState({ hasFilters, hasSearch, searchTerm, onClear, onCreate }: IEmptyStateProps) {
  const title = hasSearch
    ? `Nenhum cliente para "${searchTerm}"`
    : hasFilters
      ? "Nenhum cliente corresponde aos filtros aplicados."
      : "Você ainda não tem clientes cadastrados.";
  const description = hasFilters
    ? "Ajuste ou limpe os filtros para encontrar mais resultados."
    : "Clique em '+ Cliente' para adicionar o primeiro.";
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground">
        <Icon icon="mdi:account-search-outline" size={24} />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="flex gap-2">
        {hasFilters && (
          <Button variant="outline" size="sm" onClick={onClear}>
            Limpar filtros
          </Button>
        )}
        {onCreate && (
          <Button size="sm" onClick={onCreate}>
            <Icon icon="mdi:plus" size={16} />
            Cliente
          </Button>
        )}
      </div>
    </div>
  );
}

interface IErrorStateProps {
  onRetry: () => void;
}

function ErrorState({ onRetry }: IErrorStateProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-destructive/10 text-destructive">
        <Icon icon="mdi:alert-circle-outline" size={24} />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">Não foi possível carregar</p>
        <p className="text-xs text-muted-foreground">Tente novamente em alguns instantes.</p>
      </div>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Tentar novamente
      </Button>
    </div>
  );
}
