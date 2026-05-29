import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ICustomer, ID, ISeller, VehicleCadastroStatus } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentStore } from "@/features/multistore/hooks/useCurrentStore";
import { useCurrentRole } from "@/features/rbac/hooks/useCurrentRole";
import { usePermission } from "@/features/rbac/hooks/usePermission";
import { useVehiclesProvider } from "@/providers/data/hooks/useVehiclesProvider";
import { useCustomersProvider } from "@/providers/data/hooks/useCustomersProvider";
import { useSellersProvider } from "@/providers/data/hooks/useSellersProvider";
import { auditLog } from "@/features/rbac/utils/auditLog";
import { VehiclesHeader } from "../components/list/VehiclesHeader";
import { VehiclesFiltersBar } from "../components/list/VehiclesFiltersBar";
import { VehiclesTable } from "../components/list/VehiclesTable";
import { VehiclesPagination } from "../components/list/VehiclesPagination";
import { VehiclesBulkActionsBar } from "../components/list/VehiclesBulkActionsBar";
import { NewVehicleModal } from "../components/NewVehicleModal";
import { useVehiclesUrlState } from "../hooks/useVehiclesUrlState";
import { useVehiclesList } from "../hooks/useVehiclesList";
import { useCadastroMode } from "../hooks/useCadastroMode";
import { VEHICLE_STRINGS } from "../i18n/pt-BR";

export function VehiclesListPage() {
  const { currentUser } = useAuth();
  const { accessibleStores, currentStoreId } = useCurrentStore();
  const role = useCurrentRole();
  const isManagerOrOwner = role === "Owner" || role === "Gestor";
  const isOwner = role === "Owner";
  const canCreate = usePermission("vehicle", "create");
  const canApprove = usePermission("vehicle", "approve");
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const url = useVehiclesUrlState();
  const { filters, sort, page, pageSize } = url;
  const list = useVehiclesList(filters, sort, page, pageSize);

  const vehiclesProvider = useVehiclesProvider();
  const customersProvider = useCustomersProvider();
  const sellersProvider = useSellersProvider();

  const { mode: cadastroMode } = useCadastroMode(currentStoreId);
  // Sellers cannot create when store enforces "manual_apenas_gestor".
  const effectiveCanCreate =
    canCreate && (isManagerOrOwner || cadastroMode !== "manual_apenas_gestor");

  // Pre-load sellers and customers in scope to render the table.
  const [sellersQuery, customersQuery] = useQueries({
    queries: [
      {
        queryKey: ["sellers-list", currentStoreId, "all"] as const,
        queryFn: () => sellersProvider.list({ storeId: currentStoreId ?? undefined }),
        staleTime: 60_000,
      },
      {
        queryKey: ["customers-for-vehicles", currentStoreId, isManagerOrOwner] as const,
        queryFn: () =>
          customersProvider.list({
            storeId: isManagerOrOwner ? undefined : (currentStoreId ?? undefined),
            sellerIds:
              !isManagerOrOwner && currentUser?.sellerId ? [currentUser.sellerId] : undefined,
            pageSize: 1000,
          }),
        staleTime: 60_000,
      },
    ],
  });

  const sellers = useMemo<ISeller[]>(() => sellersQuery.data ?? [], [sellersQuery.data]);
  const customers = useMemo<ICustomer[]>(
    () => customersQuery.data?.data ?? [],
    [customersQuery.data],
  );

  const customersById = useMemo(() => {
    const map = new Map<ID, ICustomer>();
    customers.forEach((c) => map.set(c.id, c));
    return map;
  }, [customers]);

  const sellersById = useMemo(() => {
    const map = new Map<ID, ISeller>();
    sellers.forEach((s) => map.set(s.id, s));
    return map;
  }, [sellers]);

  // Vendedor: força ver só sua carteira.
  useEffect(() => {
    if (!isManagerOrOwner && currentUser?.sellerId) {
      if (filters.sellerIds.length !== 1 || filters.sellerIds[0] !== currentUser.sellerId) {
        url.patchFilters({ sellerIds: [currentUser.sellerId] });
      }
    }
  }, [isManagerOrOwner, currentUser?.sellerId, filters.sellerIds, url]);

  // Multi-select
  const [selectedIds, setSelectedIds] = useState<Set<ID>>(new Set());

  const toggleSelected = useCallback((id: ID, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const toggleAllInPage = useCallback(
    (checked: boolean) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (checked) {
          list.data.forEach((v) => next.add(v.id));
        } else {
          list.data.forEach((v) => next.delete(v.id));
        }
        return next;
      });
    },
    [list.data],
  );

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [filters, sort, page, pageSize]);

  // Modais
  const [newOpen, setNewOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const goToDetail = useCallback(
    (id: ID) => {
      void navigate({ to: "/app/veiculos/$id", params: { id } });
    },
    [navigate],
  );

  const handleBulkApprove = useCallback(async () => {
    const ids = Array.from(selectedIds).filter((id) => {
      const v = list.data.find((x) => x.id === id);
      return v && v.cadastroStatus === "pendente";
    });
    if (ids.length === 0) {
      toast.info("Nenhum veículo pendente selecionado.");
      return;
    }
    for (const id of ids) {
      const before = list.data.find((v) => v.id === id);
      await vehiclesProvider.update(id, { cadastroStatus: "aprovado" });
      auditLog({
        action: "vehicle.approved",
        resource: "vehicle",
        resourceId: id,
        before: { cadastroStatus: before?.cadastroStatus },
        after: { cadastroStatus: "aprovado" },
      });
    }
    await queryClient.invalidateQueries({ queryKey: ["vehicles-list"] });
    toast.success(VEHICLE_STRINGS.bulk.approveSuccess(ids.length));
    clearSelection();
  }, [selectedIds, list.data, vehiclesProvider, queryClient, clearSelection]);

  const handleBulkReject = useCallback(async () => {
    const ids = Array.from(selectedIds).filter((id) => {
      const v = list.data.find((x) => x.id === id);
      return v && v.cadastroStatus === "pendente";
    });
    if (ids.length === 0) {
      toast.info("Nenhum veículo pendente selecionado.");
      setRejectOpen(false);
      return;
    }
    for (const id of ids) {
      const before = list.data.find((v) => v.id === id);
      await vehiclesProvider.update(id, { cadastroStatus: "rejeitado" });
      auditLog({
        action: "vehicle.rejected",
        resource: "vehicle",
        resourceId: id,
        before: { cadastroStatus: before?.cadastroStatus },
        after: { cadastroStatus: "rejeitado", reason: rejectReason || undefined },
      });
    }
    await queryClient.invalidateQueries({ queryKey: ["vehicles-list"] });
    toast.success(VEHICLE_STRINGS.bulk.rejectSuccess(ids.length));
    setRejectReason("");
    setRejectOpen(false);
    clearSelection();
  }, [selectedIds, list.data, vehiclesProvider, queryClient, rejectReason, clearSelection]);

  const showEmptyState = !list.isLoading && list.data.length === 0;

  return (
    <div className="flex h-[calc(100vh-4rem)] min-h-0 flex-col bg-background md:h-[calc(100vh-6rem)]">
      <VehiclesHeader
        total={list.total}
        searchValue={filters.search}
        onSearchChange={(q) => url.setSearch(q)}
        canCreate={effectiveCanCreate}
        onCreate={() => setNewOpen(true)}
      />

      <VehiclesFiltersBar
        filters={filters}
        patch={(p) => url.patchFilters(p)}
        onClear={() => url.clearAll()}
        sellers={sellers}
        stores={accessibleStores}
        canFilterStore={isOwner}
        canFilterSeller={isManagerOrOwner}
        isManagerOrOwner={isManagerOrOwner}
      />

      <VehiclesBulkActionsBar
        count={selectedIds.size}
        canApprove={canApprove}
        onApprove={() => void handleBulkApprove()}
        onReject={() => setRejectOpen(true)}
        onClear={clearSelection}
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1">
          {showEmptyState ? (
            <EmptyState
              hasFilters={hasAnyFilter(filters)}
              hasSearch={filters.search.trim().length > 0}
              searchTerm={filters.search}
              onClear={() => url.clearAll()}
              onCreate={effectiveCanCreate ? () => setNewOpen(true) : undefined}
            />
          ) : list.isError ? (
            <ErrorState onRetry={list.refetch} />
          ) : (
            <VehiclesTable
              vehicles={list.data}
              isLoading={list.isLoading}
              isFetching={list.isFetching}
              selectedIds={selectedIds}
              onToggleSelected={toggleSelected}
              onToggleAllInPage={toggleAllInPage}
              sort={sort}
              onSortChange={url.setSort}
              customersById={customersById}
              sellersById={sellersById}
              onSelectVehicle={goToDetail}
              canSelect={canApprove}
            />
          )}
        </div>
        <VehiclesPagination
          page={page}
          pageSize={pageSize}
          total={list.total}
          onPageChange={url.setPage}
          onPageSizeChange={url.setPageSize}
        />
      </div>

      <NewVehicleModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        cadastroMode={cadastroMode}
        onCreated={(vehicle) => {
          void queryClient.invalidateQueries({ queryKey: ["vehicles-list"] });
          if (cadastroMode === "auto_aprovado") goToDetail(vehicle.id);
        }}
      />

      <AlertDialog open={rejectOpen} onOpenChange={(o) => !o && setRejectOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{VEHICLE_STRINGS.bulk.rejectReasonTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedIds.size}{" "}
              {selectedIds.size === 1 ? "veículo será rejeitado" : "veículos serão rejeitados"}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1">
            <Label className="text-xs">{VEHICLE_STRINGS.bulk.rejectReasonPlaceholder}</Label>
            <Textarea
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder={VEHICLE_STRINGS.bulk.rejectReasonPlaceholder}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setRejectReason("")}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleBulkReject()}>
              {VEHICLE_STRINGS.bulk.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function hasAnyFilter(filters: {
  brands: string[];
  model: string;
  engine: string;
  yearMin?: number;
  yearMax?: number;
  cadastroStatuses: VehicleCadastroStatus[];
  storeIds: ID[];
  sellerIds: ID[];
  search: string;
}): boolean {
  return (
    filters.brands.length > 0 ||
    filters.model.trim().length > 0 ||
    filters.engine.trim().length > 0 ||
    filters.yearMin !== undefined ||
    filters.yearMax !== undefined ||
    filters.cadastroStatuses.length > 0 ||
    filters.storeIds.length > 0 ||
    filters.sellerIds.length > 0 ||
    filters.search.trim().length > 0
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
    ? VEHICLE_STRINGS.list.emptySearchTitle(searchTerm)
    : hasFilters
      ? VEHICLE_STRINGS.list.emptyTitle
      : "Nenhum veículo cadastrado";
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground">
        <Icon icon="mdi:truck-remove-outline" size={24} />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{VEHICLE_STRINGS.list.emptyDescription}</p>
      </div>
      <div className="flex gap-2">
        {(hasFilters || hasSearch) && (
          <Button variant="outline" size="sm" onClick={onClear}>
            Limpar filtros
          </Button>
        )}
        {onCreate && (
          <Button size="sm" onClick={onCreate}>
            <Icon icon="mdi:plus" size={16} />
            {VEHICLE_STRINGS.list.addButton}
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
        <p className="text-sm font-semibold text-foreground">{VEHICLE_STRINGS.list.errorTitle}</p>
        <p className="text-xs text-muted-foreground">Tente novamente em alguns instantes.</p>
      </div>
      <Button variant="outline" size="sm" onClick={onRetry}>
        {VEHICLE_STRINGS.list.retry}
      </Button>
    </div>
  );
}
