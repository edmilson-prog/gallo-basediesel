import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import type { ID, ILead, ILeadFunnelStage, ISeller } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentStore } from "@/features/multistore/hooks/useCurrentStore";
import { useCurrentRole } from "@/features/rbac/hooks/useCurrentRole";
import { usePermission } from "@/features/rbac/hooks/usePermission";
import { useSellersProvider } from "@/providers/data/hooks/useSellersProvider";
import { toast } from "sonner";
import { FunnelNav } from "@/features/funnels/components/FunnelNav";
import { FUNNELS_COPY, useFunnelNavigation } from "@/features/funnels";
import { useLeadFunnelChips } from "@/features/funnels/hooks/useLeadFunnelChips";
import { useFunnelBoard } from "@/features/funnels/hooks/useFunnelBoard";
import { NewFunnelModal } from "@/features/funnels/components/NewFunnelModal";
import { ALL_FUNNELS } from "@/features/funnels/engine/resolveInitialFunnel";
import { resolveFunnelReadout } from "@/features/funnels/engine/funnelReadout";
import { isClosingKind } from "@/features/funnels/engine/stageKind";
import { FunnelReadout } from "../components/FunnelReadout";
import { LeadsHeader } from "../components/LeadsHeader";
import { LeadsFiltersBar } from "../components/LeadsFiltersBar";
import { LeadsKanban } from "../components/kanban/LeadsKanban";
import { LeadsList } from "../components/LeadsList";
import { NewLeadModal } from "../components/NewLeadModal";
import { CloseDecisionModal } from "../components/CloseDecisionModal";
import { ConvertLeadModal } from "../components/ConvertLeadModal";
import { MarkAsLostModal } from "../components/MarkAsLostModal";
import { useLeadsUrlState, type LeadsView } from "../hooks/useLeadsUrlState";
import { useLeadsList } from "../hooks/useLeadsList";
import { useLeadSelection } from "../hooks/useLeadSelection";
import { useBulkLeadActions } from "../hooks/useBulkLeadActions";
import { useMoveLeadStage } from "../hooks/useMoveLeadStage";
import { BulkActionBar } from "../components/BulkActionBar";
import { usePipelineSettings } from "../hooks/usePipelineSettings";
import { hasAnyFilter } from "../utils/listFilters";
import { LEADS_STRINGS } from "../i18n/pt-BR";

/** Stable identity so the stage-filter memo does not fire on every render. */
const EMPTY_IDS: string[] = [];

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

  const { stages, lossReasons } = usePipelineSettings(currentStoreId);

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

  // The consolidated sentinel is not a funnel id — it means "do not scope".
  const isAllFunnels = url.funnelId === ALL_FUNNELS;
  const scopedFunnelId = isAllFunnels ? undefined : url.funnelId;

  // The stage filter has to speak the board's language. With a funnel open its
  // options are that funnel's stages, so it is applied over the PARTICIPATION —
  // `useLeadsList` filters `lead.stage.id`, the legacy snapshot, which would
  // match none of those ids and quietly empty the page.
  const funnelStageFilter = scopedFunnelId ? filters.stageIds : EMPTY_IDS;
  const listFilters = useMemo(
    () => (scopedFunnelId ? { ...filters, stageIds: [] } : filters),
    [scopedFunnelId, filters],
  );

  const list = useLeadsList({
    filters: listFilters,
    sort,
    storeId: currentStoreId ?? undefined,
    sellerScopeIds,
    ownerCrossStore: isOwner && filters.storeIds.length === 0,
    funnelId: scopedFunnelId,
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
    (_lead: ILead, _stage: ILeadFunnelStage) => {
      invalidateLeads();
    },
    [invalidateLeads],
  );

  const handleRequestClose = useCallback((lead: ILead) => {
    setCloseDecision(lead);
  }, []);

  const handleEmptyCreate = canCreate ? () => setNewOpen(true) : undefined;

  // Reported by the list view; the kanban has no single vertical scroller, so
  // the progress line stays at zero there instead of tracking one column.
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null);

  const [newFunnelOpen, setNewFunnelOpen] = useState(false);
  const canManageFunnels = isManagerOrOwner;
  const openNewFunnel = useCallback(() => setNewFunnelOpen(true), []);

  // Every funnel owns its stages, so there is no shared X axis and a unified
  // kanban cannot exist (spec 6.3). The consolidated view therefore forces the
  // list rather than rendering a board that would silently mix id namespaces.
  const effectiveView: LeadsView = isAllFunnels ? "list" : view;

  // The column shows whenever the user reaches more than one funnel, and
  // always in the consolidated view — where it is the only thing telling you
  // which board a row belongs to.
  const { funnels: reachableFunnels } = useFunnelNavigation();
  const funnelChipsByLead = useLeadFunnelChips(reachableFunnels);

  // The board is the FUNNEL's board: columns and card positions come from the
  // participation, not from the store's pipeline. `usePipelineSettings` stays
  // on for the filters bar and the new-lead modal, which still speak legacy.
  const board = useFunnelBoard(scopedFunnelId ?? null);
  const activeFunnel = reachableFunnels.find((f) => f.id === scopedFunnelId);
  const showFunnelColumn = isAllFunnels || reachableFunnels.length > 1;

  const visibleLeads = useMemo(() => {
    if (funnelStageFilter.length === 0) return list.leads;
    const keep = new Set(funnelStageFilter);
    return list.leads.filter((l) => {
      const entry = board.entriesByLead.get(l.id);
      return entry ? keep.has(entry.stageId) : false;
    });
  }, [list.leads, funnelStageFilter, board.entriesByLead]);

  // A stage left out of the filter disappears from the board rather than
  // becoming an empty column: filtering by stage is asking to see those only.
  const visibleStages = useMemo(() => {
    if (funnelStageFilter.length === 0) return board.stages;
    const keep = new Set(funnelStageFilter);
    return board.stages.filter((s) => keep.has(s.id));
  }, [board.stages, funnelStageFilter]);

  // Convertido and Perdido stop being columns. They are outcomes, not stages of
  // work — nobody drags a card into them to decide something — and as columns
  // they were spending a third of the board's width on leads nobody touches.
  // They still exist as move targets: the card's "mover para…" menu is fed the
  // FULL stage list, so closing a lead from the board keeps working.
  const boardColumns = useMemo(
    () => visibleStages.filter((s) => !isClosingKind(s.kind)),
    [visibleStages],
  );

  const readout = useMemo(
    () => resolveFunnelReadout({ stages: board.stages, summaryByStage: board.summaryByStage }),
    [board.stages, board.summaryByStage],
  );

  /** A second click on the same segment clears it — no dead end at one stage. */
  const toggleStageFilter = useCallback(
    (stageId: ID) => {
      const only = filters.stageIds.length === 1 && filters.stageIds[0] === stageId;
      url.patchFilters({ stageIds: only ? [] : [stageId] });
    },
    [filters.stageIds, url],
  );

  // An outcome has no column to jump to, so it opens the list scoped to it —
  // and lifts the exclusion that keeps closed leads out of the board, or the
  // click would land on "nenhum lead encontrado".
  const openOutcome = useCallback(
    (stageId: ID) => {
      const stage = board.stages.find((s) => s.id === stageId);
      url.setView("list");
      url.patchFilters({
        stageIds: [stageId],
        ...(stage?.kind === "perda" ? { includeLost: true } : {}),
        ...(stage?.kind === "ganho" ? { includeConverted: true } : {}),
      });
    },
    [board.stages, url],
  );

  // Bulk actions live on the list, which is where triage happens.
  const visibleIds = useMemo(() => visibleLeads.map((l) => l.id), [visibleLeads]);
  const selection = useLeadSelection(visibleIds);
  const bulk = useBulkLeadActions(() => selection.clear());
  const canBulk = usePermission("lead", "edit");

  // Triage mode pins the row decisions open. Off by default — the list is also
  // where people just read — and turned on for them when the band sends them
  // here, which is precisely the trip that exists to decide things.
  const [triageMode, setTriageMode] = useState(false);

  const stagesById = useMemo(() => {
    const map = new Map<ID, ILeadFunnelStage>();
    for (const s of board.stages) map.set(s.id, s);
    return map;
  }, [board.stages]);

  const moveStage = useMoveLeadStage({
    funnelId: scopedFunnelId ?? "",
    onRequestClose: handleRequestClose,
    onMoved: invalidateLeads,
  });

  const rowActions = useMemo(
    () =>
      canBulk
        ? {
            sellers,
            // The consolidated view has no shared stage axis, so moving from a
            // row there has no destination list to offer.
            stages: scopedFunnelId ? board.stages : [],
            onAssign: (lead: ILead, sellerId: ID, sellerName: string) =>
              void bulk.assignSeller([lead.id], sellerId, sellerName),
            onMove: (lead: ILead, stageId: ID) => {
              const entry = board.entriesByLead.get(lead.id);
              const target = stagesById.get(stageId);
              if (!entry || !target) return;
              void moveStage({ lead, entry, target });
            },
            // Losing a lead goes through the modal that demands a reason — the
            // reason is what turns the loss into data.
            onDiscard: (lead: ILead) => setLostTarget(lead),
          }
        : undefined,
    [canBulk, sellers, scopedFunnelId, board.stages, board.entriesByLead, stagesById, bulk, moveStage],
  );
  // The stage a lost lead lands on, mirroring MarkAsLostModal.
  const lostStage = stages.find((s) => /perdid/i.test(s.name)) ?? stages[stages.length - 1];

  const noticeShownRef = useRef(false);
  useEffect(() => {
    if (!isAllFunnels || noticeShownRef.current) return;
    noticeShownRef.current = true;
    toast.info(FUNNELS_COPY.allFunnelsNotice);
  }, [isAllFunnels]);

  return (
    <div className="flex h-[calc(100vh-4rem-var(--shell-banner-offset,0px))] min-h-0 flex-col bg-background md:h-[calc(100vh-6rem-var(--shell-banner-offset,0px))]">
      <LeadsHeader
        activeCount={activeCount}
        searchValue={filters.search}
        view={effectiveView}
        canCreate={canCreate}
        onSearchChange={url.setSearch}
        onViewChange={url.setView}
        onCreate={() => setNewOpen(true)}
        scrollEl={scrollEl}
        metricsLeads={list.allLeads}
        funnelSlot={
          <FunnelNav slot="header" canManage={canManageFunnels} onCreate={openNewFunnel} />
        }
        viewLocked={isAllFunnels}
        viewLockedReason={FUNNELS_COPY.allFunnelsNotice}
      />

      <FunnelNav slot="tabs" canManage={canManageFunnels} onCreate={openNewFunnel} />

      {scopedFunnelId && (
        <FunnelReadout
          readout={readout}
          activeStageIds={filters.stageIds}
          onToggleStage={toggleStageFilter}
          onOpenOutcome={openOutcome}
          onFilterOverdue={() => url.patchFilters({ nextAction: "overdue" })}
        />
      )}

      <LeadsFiltersBar
        filters={filters}
        patch={(p) => url.patchFilters(p)}
        onClear={url.clearAll}
        // With a funnel open the filter offers that funnel's stages; the
        // consolidated view has no shared X axis, so it keeps the legacy list.
        stages={scopedFunnelId && board.stages.length > 0 ? board.stages : stages}
        sellers={sellers}
        stores={accessibleStores}
        canFilterStore={isOwner}
        canFilterSeller={isManagerOrOwner}
        view={effectiveView}
      />


      <div className="flex min-h-0 flex-1 overflow-hidden">
        <FunnelNav slot="rail" canManage={canManageFunnels} onCreate={openNewFunnel} />

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {list.isLoading && list.leads.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Carregando leads…
          </div>
        ) : list.isError ? (
          <ErrorState onRetry={list.refetch} />
        ) : effectiveView === "kanban" && scopedFunnelId && boardColumns.length > 0 ? (
          // The board renders even with no leads. A funnel is its stages before
          // it is its cards: a freshly created one would otherwise show
          // "nenhum lead encontrado" and hide the very columns the user needs
          // to see — and to drop the first lead into.
          <LeadsKanban
            leads={visibleLeads}
            // Every stage, including the terminal ones: they feed the card's
            // move menu and the drop resolution even though they no longer own
            // a column. `columnStages` is what actually gets rendered.
            stages={board.stages}
            columnStages={boardColumns}
            entriesByLead={board.entriesByLead}
            summaryByStage={board.summaryByStage}
            funnelId={scopedFunnelId}
            sellersById={sellersById}
            // The seller avatar is noise when the board is already one seller's
            // — the case of a plain seller, forced above.
            showSeller={sellerScopeIds === undefined && filters.sellerIds.length !== 1}
            chipsByLead={funnelChipsByLead}
            highlightLeadId={url.highlight}
            onGoToFunnel={url.goToFunnelAndHighlight}
            onLeadMoved={handleLeadMoved}
            onRequestClose={handleRequestClose}
            onFilterOverdue={() => url.patchFilters({ nextAction: "overdue" })}
            entryThreshold={activeFunnel?.entryAlertThreshold ?? 50}
            onTriageInList={(stageId) => {
              // The List has to open already narrowed to that stage, or the
              // user lands on nine hundred rows and the "triar em lista"
              // promise is broken on arrival — and already in triage mode,
              // because deciding is the entire reason for the trip.
              setTriageMode(true);
              url.setView("list");
              url.patchFilters({ stageIds: [stageId] });
            }}
          />
        ) : visibleLeads.length === 0 ? (
          <EmptyState
            hasFilters={hasAnyFilter(filters)}
            searchTerm={filters.search}
            onClear={url.clearAll}
            onCreate={handleEmptyCreate}
          />
        ) : (
          <>
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2 text-xs text-muted-foreground">
            <span>
              <b className="font-semibold text-foreground">
                {LEADS_STRINGS.list.triage.summary(visibleLeads.length)}
              </b>
              {sort.orderBy === "nextActionAt" && ` · ${LEADS_STRINGS.list.triage.sortedByOverdue}`}
            </span>
            {canBulk && (
              <Button
                variant="outline"
                size="sm"
                aria-pressed={triageMode}
                onClick={() => setTriageMode((v) => !v)}
                className={cn(
                  "ml-auto h-8 gap-1.5 text-xs",
                  triageMode && "border-primary/40 bg-primary/5 font-semibold text-primary",
                )}
              >
                <Icon icon="mdi:format-list-checks" size={14} aria-hidden />
                {LEADS_STRINGS.list.triage.toggle}
              </Button>
            )}
          </div>
          <LeadsList
            leads={visibleLeads}
            sellersById={sellersById}
            isLoading={list.isLoading}
            sort={sort}
            onSortChange={url.setSort}
            scrollRef={setScrollEl}
            funnelChipsByLead={showFunnelColumn ? funnelChipsByLead : undefined}
            entriesByLead={scopedFunnelId ? board.entriesByLead : undefined}
            stagesById={scopedFunnelId ? stagesById : undefined}
            selection={canBulk ? selection : undefined}
            rowActions={rowActions}
            triageMode={triageMode}
          />
          {canBulk && (
            <BulkActionBar
              count={selection.selected.size}
              progress={bulk.progress}
              funnels={reachableFunnels}
              sellers={sellers}
              lossReasons={lossReasons}
              lostStage={lostStage}
              onDefaultFunnel={Boolean(activeFunnel?.isDefault)}
              onClear={selection.clear}
              onAddToFunnel={(id, name) =>
                void bulk.addToFunnel([...selection.selected], id, name)
              }
              onAssignSeller={(id, name) =>
                void bulk.assignSeller([...selection.selected], id, name)
              }
              onMarkLost={(reason, stage) =>
                void bulk.markLost([...selection.selected], reason, stage)
              }
            />
          )}
          </>
        )}
        </div>
      </div>

      <NewFunnelModal
        open={newFunnelOpen}
        onClose={() => setNewFunnelOpen(false)}
        storeId={currentStoreId}
        existing={reachableFunnels}
        onCreated={(f) => {
          setNewFunnelOpen(false);
          url.setFunnel(f.id);
        }}
      />

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
