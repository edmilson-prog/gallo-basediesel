import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ICarteiraTransfer, ID, ISeller } from "@/shared/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Icon } from "@/components/Icon";
import { EmptyState } from "@/features/shell/components/EmptyState";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentRole } from "@/features/rbac/hooks/useCurrentRole";
import { useCurrentStore } from "@/features/multistore/hooks/useCurrentStore";
import { useSellersProvider } from "@/providers/data/hooks/useSellersProvider";
import { ActiveTransferCard } from "../components/ActiveTransferCard";
import { TransferHistoryTable } from "../components/TransferHistoryTable";
import { TransferFiltersBar } from "../components/TransferFiltersBar";
import { TransferAuditTab } from "../components/TransferAuditTab";
import { RevertTransferModal } from "../components/RevertTransferModal";
import { NewTemporaryTransferModal } from "../components/NewTemporaryTransferModal";
import { useTransfersList, type ITransfersListFilters } from "../hooks/useTransfersList";
import { useTransferClosureAudit } from "../hooks/useTransferClosureAudit";
import { CARTEIRA_STRINGS } from "../i18n/pt-BR";

type Tab = "active" | "history" | "audit";

const EMPTY_FILTERS: ITransfersListFilters = {};

export function CarteiraPage() {
  const { currentUser } = useAuth();
  const role = useCurrentRole();
  const { currentStoreId } = useCurrentStore();
  const isOwner = role === "Owner";
  const isManager = role === "Gestor";
  const canManage = isOwner || isManager;

  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("active");
  const [newOpen, setNewOpen] = useState<"none" | "temporary" | "individual" | "batch">("none");
  const [revertTarget, setRevertTarget] = useState<ICarteiraTransfer | null>(null);
  const [activeFilters, setActiveFilters] = useState<ITransfersListFilters>(EMPTY_FILTERS);
  const [historyFilters, setHistoryFilters] = useState<ITransfersListFilters>(EMPTY_FILTERS);
  const [historyPage, setHistoryPage] = useState(1);

  const sellersProvider = useSellersProvider();
  const sellersQuery = useQuery({
    queryKey: ["carteira-sellers", currentStoreId ?? null],
    queryFn: () => sellersProvider.list({ storeId: currentStoreId ?? undefined }),
    staleTime: 60_000,
  });
  const sellers: ISeller[] = useMemo(() => sellersQuery.data ?? [], [sellersQuery.data]);
  const sellersById = useMemo(() => {
    const map = new Map<ID, ISeller>();
    sellers.forEach((s) => map.set(s.id, s));
    return map;
  }, [sellers]);

  const activeQuery = useTransfersList({
    storeId: currentStoreId ?? undefined,
    scope: "active",
    filters: activeFilters,
    pageSize: 50,
  });

  const historyQuery = useTransfersList({
    storeId: currentStoreId ?? undefined,
    scope: "history",
    filters: historyFilters,
    page: historyPage,
    pageSize: 20,
  });

  const activeList = activeQuery.data?.data ?? [];
  const temporaryCount = activeList.filter((t) => t.type === "temporary").length;
  const totalActive = activeList.length;

  const handleActiveFilterChange = useCallback((patch: Partial<ITransfersListFilters>) => {
    setActiveFilters((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleHistoryFilterChange = useCallback((patch: Partial<ITransfersListFilters>) => {
    setHistoryFilters((prev) => ({ ...prev, ...patch }));
    setHistoryPage(1);
  }, []);

  const historyTotal = historyQuery.data?.total ?? 0;
  const historyTotalPages = Math.max(1, Math.ceil(historyTotal / 20));

  const historyIds = useMemo(
    () => (historyQuery.data?.data ?? []).map((t) => t.id),
    [historyQuery.data],
  );
  const { closureByTransferId } = useTransferClosureAudit(historyIds, currentStoreId ?? undefined);

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border bg-card px-6 py-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {CARTEIRA_STRINGS.page.title}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {CARTEIRA_STRINGS.page.subtitle}
          </p>
          <p className="mt-2 text-xs font-medium text-foreground">
            {CARTEIRA_STRINGS.page.activeSummary(totalActive, temporaryCount)}
          </p>
        </div>

        {canManage && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="gap-2">
                <Icon icon="mdi:plus" size={16} />
                {CARTEIRA_STRINGS.page.newTransfer}
                <Icon icon="mdi:chevron-down" size={14} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuItem onSelect={() => setNewOpen("temporary")}>
                <Icon icon="mdi:clock-time-five-outline" size={14} />
                {CARTEIRA_STRINGS.page.newTemporary}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  toast.info(
                    "Transferência permanente individual: abra a ficha do cliente e use o menu ⋮ → Transferir carteira.",
                  );
                  void navigate({ to: "/app/clientes" });
                }}
              >
                <Icon icon="mdi:account-arrow-right-outline" size={14} />
                {CARTEIRA_STRINGS.page.newPermanentIndividual}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  toast.info(
                    "Transferência em lote: selecione múltiplos clientes na lista e clique em 'Transferir vendedor'.",
                  );
                  void navigate({ to: "/app/clientes" });
                }}
              >
                <Icon icon="mdi:account-group-outline" size={14} />
                {CARTEIRA_STRINGS.page.newPermanentBatch}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as Tab)}
        className="flex flex-1 flex-col overflow-hidden"
      >
        <div className="border-b border-border bg-card px-6">
          <TabsList className="my-2">
            <TabsTrigger value="active">{CARTEIRA_STRINGS.tabs.active}</TabsTrigger>
            <TabsTrigger value="history">{CARTEIRA_STRINGS.tabs.history}</TabsTrigger>
            <TabsTrigger value="audit">{CARTEIRA_STRINGS.tabs.audit}</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="active" className="m-0 flex-1 overflow-y-auto px-6 py-4">
          <div className="space-y-4">
            <TransferFiltersBar
              filters={activeFilters}
              sellers={sellers}
              showStatusFilter={false}
              onChange={handleActiveFilterChange}
              onClear={() => setActiveFilters(EMPTY_FILTERS)}
            />

            {activeQuery.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-32 w-full rounded-lg" />
                ))}
              </div>
            ) : activeQuery.isError ? (
              <EmptyState
                icon="mdi:alert-circle-outline"
                title="Falha ao carregar transferências"
                description="Tente novamente em instantes."
              />
            ) : activeList.length === 0 ? (
              <EmptyState
                icon="mdi:briefcase-account-outline"
                title={CARTEIRA_STRINGS.active.emptyTitle}
                description={CARTEIRA_STRINGS.active.emptyDescription}
              />
            ) : (
              <div className="space-y-3">
                {activeList.map((t) => (
                  <ActiveTransferCard
                    key={t.id}
                    transfer={t}
                    sellersById={sellersById}
                    canRevert={canManage}
                    onRevert={setRevertTarget}
                  />
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="history" className="m-0 flex-1 overflow-y-auto px-6 py-4">
          <div className="space-y-4">
            <TransferFiltersBar
              filters={historyFilters}
              sellers={sellers}
              showStatusFilter
              onChange={handleHistoryFilterChange}
              onClear={() => {
                setHistoryFilters(EMPTY_FILTERS);
                setHistoryPage(1);
              }}
            />

            {historyQuery.isLoading ? (
              <Skeleton className="h-64 w-full rounded-lg" />
            ) : historyQuery.isError ? (
              <EmptyState
                icon="mdi:alert-circle-outline"
                title="Falha ao carregar histórico"
                description="Tente novamente em instantes."
              />
            ) : (historyQuery.data?.data.length ?? 0) === 0 ? (
              <EmptyState
                icon="mdi:history"
                title={CARTEIRA_STRINGS.history.emptyTitle}
                description={CARTEIRA_STRINGS.history.emptyDescription}
              />
            ) : (
              <TransferHistoryTable
                transfers={historyQuery.data?.data ?? []}
                sellersById={sellersById}
                closureByTransferId={closureByTransferId}
                page={historyPage}
                totalPages={historyTotalPages}
                total={historyTotal}
                onPageChange={setHistoryPage}
              />
            )}
          </div>
        </TabsContent>

        <TabsContent value="audit" className="m-0 flex-1 overflow-y-auto px-6 py-4">
          <TransferAuditTab storeId={currentStoreId ?? undefined} sellersById={sellersById} />
        </TabsContent>
      </Tabs>

      {canManage && currentUser && (
        <NewTemporaryTransferModal
          open={newOpen === "temporary"}
          sellers={sellers}
          storeId={currentStoreId ?? "00000000-0000-0000-0000-000000000001"}
          currentSellerId={currentUser.sellerId}
          activeTransfers={activeList}
          onClose={() => setNewOpen("none")}
        />
      )}

      <RevertTransferModal
        transfer={revertTarget}
        sellersById={sellersById}
        currentSellerId={currentUser?.sellerId}
        onClose={() => setRevertTarget(null)}
      />
    </div>
  );
}
