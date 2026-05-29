import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import type { ID, ILead, IPipelineStage, ISeller } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentStore } from "@/features/multistore/hooks/useCurrentStore";
import { useCurrentRole } from "@/features/rbac/hooks/useCurrentRole";
import { usePermission } from "@/features/rbac/hooks/usePermission";
import { useSellersProvider } from "@/providers/data/hooks/useSellersProvider";
import { LeadsHeader } from "../components/LeadsHeader";
import { LeadsFiltersBar } from "../components/LeadsFiltersBar";
import { KanbanMetricsBar } from "../components/KanbanMetricsBar";
import { LeadsKanban } from "../components/kanban/LeadsKanban";
import { LeadsList } from "../components/LeadsList";
import { NewLeadModal } from "../components/NewLeadModal";
import { CloseDecisionModal } from "../components/CloseDecisionModal";
import { ConvertLeadModal } from "../components/ConvertLeadModal";
import { MarkAsLostModal } from "../components/MarkAsLostModal";
import { useLeadsUrlState } from "../hooks/useLeadsUrlState";
import { useLeadsList } from "../hooks/useLeadsList";
import { usePipelineSettings } from "../hooks/usePipelineSettings";
import { hasAnyFilter } from "../utils/listFilters";
import { LEADS_STRINGS } from "../i18n/pt-BR";

export function LeadsPage() {
  const { currentUser } = useAuth();
  const { accessibleStores, currentStoreId } = useCurrentStore();
  const role = useCurrentRole();
  const isManagerOrOwner = role === "Owner" || role === "Gestor";
  const isOwner = role === "Owner";
  const canCreate = usePermission("lead", "create");
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const url = useLeadsUrlState();
  const { view, filters, sort } = url;

  const { stages } = usePipelineSettings(currentStoreId);

  const sellersProvider = useSellersProvider();
  const [sellersQuery] = useQueries({
    queries: [
      {
        queryKey: ["sellers-list", currentStoreId, "all"] as const,
        queryFn: () => sellersProvider.list({ storeId: currentStoreId ?? undefined }),
        staleTime: 60_000,
      },
    ],
  });
  const sellers: ISeller[] = useMemo(() => sellersQuery.data ?? [], [sellersQuery.data]);

  const sellersById = useMemo(() => {
    const map = new Map<ID, ISeller>();
    sellers.forEach((s) => map.set(s.id, s));
    return map;
  }, [sellers]);

  // Vendedor: força ver só seus leads.
  const sellerScopeIds = useMemo(() => {
    if (!isManagerOrOwner && currentUser?.sellerId) {
      return [currentUser.sellerId];
    }
    return undefined;
  }, [isManagerOrOwner, currentUser?.sellerId]);

  useEffect(() => {
    if (!isManagerOrOwner && currentUser?.sellerId) {
      if (filters.sellerIds.length !== 1 || filters.sellerIds[0] !== currentUser.sellerId) {
        url.patchFilters({ sellerIds: [currentUser.sellerId] });
      }
    }
  }, [isManagerOrOwner, currentUser?.sellerId, filters.sellerIds, url]);

  const list = useLeadsList({
    filters,
    sort,
    storeId: currentStoreId ?? undefined,
    sellerScopeIds,
    ownerCrossStore: isOwner && filters.storeIds.length === 0,
  });

  const activeCount = useMemo(
    () => list.leads.filter((l) => !l.convertedToCustomerId && !l.lossReason).length,
    [list.leads],
  );

  // Modais
  const [newOpen, setNewOpen] = useState(false);
  const [closeDecision, setCloseDecision] = useState<ILead | null>(null);
  const [convertTarget, setConvertTarget] = useState<ILead | null>(null);
  const [lostTarget, setLostTarget] = useState<ILead | null>(null);

  const invalidateLeads = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["leads-list"] });
  }, [queryClient]);

  const handleLeadMoved = useCallback(
    (_lead: ILead, _stage: IPipelineStage) => {
      invalidateLeads();
    },
    [invalidateLeads],
  );

  const handleRequestClose = useCallback((lead: ILead) => {
    setCloseDecision(lead);
  }, []);

  const handleEmptyCreate = canCreate ? () => setNewOpen(true) : undefined;

  return (
    <div className="flex h-[calc(100vh-4rem)] min-h-0 flex-col bg-background md:h-[calc(100vh-6rem)]">
      <LeadsHeader
        activeCount={activeCount}
        searchValue={filters.search}
        view={view}
        canCreate={canCreate}
        onSearchChange={url.setSearch}
        onViewChange={url.setView}
        onCreate={() => setNewOpen(true)}
      />

      <LeadsFiltersBar
        filters={filters}
        patch={(p) => url.patchFilters(p)}
        onClear={url.clearAll}
        stages={stages}
        sellers={sellers}
        stores={accessibleStores}
        canFilterStore={isOwner}
        canFilterSeller={isManagerOrOwner}
        view={view}
      />

      {view === "kanban" && <KanbanMetricsBar leads={list.leads} />}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {list.isLoading && list.leads.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Carregando leads…
          </div>
        ) : list.isError ? (
          <ErrorState onRetry={list.refetch} />
        ) : list.leads.length === 0 ? (
          <EmptyState
            hasFilters={hasAnyFilter(filters)}
            searchTerm={filters.search}
            onClear={url.clearAll}
            onCreate={handleEmptyCreate}
          />
        ) : view === "kanban" ? (
          <LeadsKanban
            leads={list.leads}
            stages={stages}
            sellersById={sellersById}
            onLeadMoved={handleLeadMoved}
            onRequestClose={handleRequestClose}
          />
        ) : (
          <LeadsList
            leads={list.leads}
            sellersById={sellersById}
            isLoading={list.isLoading}
            sort={sort}
            onSortChange={url.setSort}
          />
        )}
      </div>

      <NewLeadModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        stages={stages}
        sellers={sellers}
        onCreated={(lead) => {
          invalidateLeads();
          setNewOpen(false);
          void navigate({ to: "/app/leads/$id", params: { id: lead.id } });
        }}
      />

      <CloseDecisionModal
        lead={closeDecision}
        onCancel={() => setCloseDecision(null)}
        onConverted={(lead) => {
          setCloseDecision(null);
          setConvertTarget(lead);
        }}
        onLost={(lead) => {
          setCloseDecision(null);
          setLostTarget(lead);
        }}
      />

      <ConvertLeadModal
        lead={convertTarget}
        onClose={() => setConvertTarget(null)}
        onConverted={(customerId) => {
          setConvertTarget(null);
          invalidateLeads();
          void navigate({ to: "/app/clientes/$id", params: { id: customerId } });
        }}
      />

      <MarkAsLostModal
        lead={lostTarget}
        onClose={() => setLostTarget(null)}
        onMarked={() => {
          setLostTarget(null);
          invalidateLeads();
        }}
      />
    </div>
  );
}

interface IEmptyStateProps {
  hasFilters: boolean;
  searchTerm: string;
  onClear: () => void;
  onCreate?: () => void;
}

function EmptyState({ hasFilters, searchTerm, onClear, onCreate }: IEmptyStateProps) {
  const title =
    searchTerm.trim().length > 0
      ? LEADS_STRINGS.list.emptySearchTitle(searchTerm)
      : LEADS_STRINGS.list.emptyTitle;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground">
        <Icon icon="mdi:account-question-outline" size={24} />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{LEADS_STRINGS.list.emptyDescription}</p>
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
            {LEADS_STRINGS.page.addLead}
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
        <p className="text-sm font-semibold text-foreground">{LEADS_STRINGS.list.errorTitle}</p>
        <p className="text-xs text-muted-foreground">Tente novamente em alguns instantes.</p>
      </div>
      <Button variant="outline" size="sm" onClick={onRetry}>
        {LEADS_STRINGS.list.retry}
      </Button>
    </div>
  );
}
