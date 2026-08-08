import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type {
  ID,
  IFunnelBoardSummary,
  ILead,
  ILeadFunnelEntry,
  ILeadFunnelStage,
  ISeller,
} from "@/shared/types";
import { auditLog } from "@/features/rbac/utils/auditLog";
import { useLeadFunnelsProvider } from "@/providers/data/hooks/useLeadFunnelsProvider";
import { bucketLeadsByStage, type IBoardCard } from "@/features/funnels/engine/boardBuckets";
import type { ILeadFunnelChip } from "@/features/funnels/hooks/useLeadFunnelChips";
import { LEADS_STRINGS } from "../../i18n/pt-BR";
import { BoardCard } from "./BoardCard";
import { boardKeyboardCoordinates } from "./boardKeyboardCoordinates";
import { KanbanColumn } from "./KanbanColumn";

const NO_CHIPS: ILeadFunnelChip[] = [];

export interface ILeadsKanbanProps {
  leads: ILead[];
  /**
   * The active funnel's stages — never the store's legacy pipeline. ALL of
   * them, terminal ones included: they are move targets and drop targets even
   * though they no longer own a column.
   */
  stages: ILeadFunnelStage[];
  /**
   * The subset that actually gets a column. Convertido and Perdido are read on
   * the readout strip above the board instead: they are outcomes, not stages of
   * work, and as columns they took a third of the width for leads nobody drags.
   */
  columnStages: ILeadFunnelStage[];
  entriesByLead: Map<ID, ILeadFunnelEntry>;
  summaryByStage: Map<ID, IFunnelBoardSummary>;
  funnelId: ID;
  sellersById: Map<ID, ISeller>;
  /** False when the board is already scoped to a single seller. */
  showSeller: boolean;
  chipsByLead: Map<ID, ILeadFunnelChip[]>;
  /** Lead this board was asked to point at, if any. */
  highlightLeadId: ID | undefined;
  onGoToFunnel: (funnelId: ID, leadId: ID) => void;
  onLeadMoved: (lead: ILead, toStage: ILeadFunnelStage) => void;
  /** Dropped on a won/lost stage — the host opens the decision modal. */
  onRequestClose: (lead: ILead) => void;
  /** The column header's overdue count is a filter, not a label. */
  onFilterOverdue: () => void;
  /** `entry_alert_threshold` of the open funnel — when the entry stage flips. */
  entryThreshold: number;
  onTriageInList: (stageId: ID) => void;
}

export function LeadsKanban({
  leads,
  stages,
  columnStages,
  entriesByLead,
  summaryByStage,
  funnelId,
  sellersById,
  showSeller,
  chipsByLead,
  highlightLeadId,
  onGoToFunnel,
  onLeadMoved,
  onRequestClose,
  onFilterOverdue,
  entryThreshold,
  onTriageInList,
}: ILeadsKanbanProps) {
  const provider = useLeadFunnelsProvider();
  const queryClient = useQueryClient();
  const [dragging, setDragging] = useState<IBoardCard | null>(null);

  const buckets = useMemo(
    () => bucketLeadsByStage({ leads, entriesByLead, stages }),
    [leads, entriesByLead, stages],
  );

  const cardByLead = useMemo(() => {
    const map = new Map<ID, IBoardCard>();
    for (const bucket of buckets.values()) for (const card of bucket) map.set(card.lead.id, card);
    return map;
  }, [buckets]);

  const stageById = useMemo(() => {
    const map = new Map<ID, ILeadFunnelStage>();
    for (const s of stages) map.set(s.id, s);
    return map;
  }, [stages]);

  const sensors = useSensors(
    // distance 6: `cursor-grab` is always on and a click competes with a drag.
    // Opening the lead's page on click requires a micro-movement not to become
    // a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // Before this there was no way at all to move a lead without a pointer.
    // The coordinate getter is ours: `sortableKeyboardCoordinates` needs a
    // SortableContext, which a board of independent columns has not got, and
    // with it the card is grabbed and then cannot be moved at all.
    useSensor(KeyboardSensor, { coordinateGetter: boardKeyboardCoordinates }),
  );

  /** One move, whether it came from the pointer, the keyboard or the menu. */
  const move = useCallback(
    async (card: IBoardCard, target: ILeadFunnelStage) => {
      if (card.entry.stageId === target.id) return;

      // No longer compares against CLOSING_STAGE_ID, a constant in the code:
      // the stage's own `kind` carries the meaning, and every funnel has one.
      if (target.kind === "ganho" || target.kind === "perda") {
        onRequestClose(card.lead);
        return;
      }

      try {
        // moveEntry, not leads.update: with N:N the board alters ONLY this
        // funnel's participation. The lead's other funnels are untouched.
        await provider.moveEntry(card.entry.id, target.id);
        auditLog({
          action: "lead_funnel_entry.stage_changed",
          resource: "lead",
          resourceId: card.lead.id,
          before: { stageId: card.entry.stageId },
          after: { stageId: target.id },
        });
        toast.success(LEADS_STRINGS.toasts.moved(target.name));
        onLeadMoved(card.lead, target);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["lead-funnel-entries", funnelId] }),
          queryClient.invalidateQueries({ queryKey: ["lead-funnel-board-summary", funnelId] }),
        ]);
      } catch {
        toast.error(LEADS_STRINGS.toasts.moveError);
      }
    },
    [provider, queryClient, funnelId, onLeadMoved, onRequestClose],
  );

  const announcements: Announcements = useMemo(
    () => ({
      onDragStart: ({ active }) => {
        const card = cardByLead.get(String(active.id));
        return LEADS_STRINGS.kanban.dnd.grabbed(card?.lead.name ?? String(active.id));
      },
      onDragOver: ({ over }) => {
        const stage = over ? stageById.get(String(over.id)) : undefined;
        return stage ? LEADS_STRINGS.kanban.dnd.over(stage.name) : LEADS_STRINGS.kanban.dnd.outside;
      },
      onDragEnd: ({ active, over }) => {
        const card = cardByLead.get(String(active.id));
        const stage = over ? stageById.get(String(over.id)) : undefined;
        return stage
          ? LEADS_STRINGS.kanban.dnd.dropped(card?.lead.name ?? String(active.id), stage.name)
          : LEADS_STRINGS.kanban.dnd.outside;
      },
      onDragCancel: () => LEADS_STRINGS.kanban.dnd.cancelled,
    }),
    [cardByLead, stageById],
  );

  const handleDragStart = useCallback(
    (e: DragStartEvent) => setDragging(cardByLead.get(String(e.active.id)) ?? null),
    [cardByLead],
  );

  const handleDragEnd = useCallback(
    (e: DragEndEvent) => {
      setDragging(null);
      if (!e.over) return;
      const card = cardByLead.get(String(e.active.id));
      const target = stageById.get(String(e.over.id));
      if (!card || !target) return;
      void move(card, target);
    },
    [cardByLead, stageById, move],
  );

  const handleMoveById = useCallback(
    (leadId: ID, stageId: ID) => {
      const card = cardByLead.get(leadId);
      const target = stageById.get(stageId);
      if (!card || !target) return;
      void move(card, target);
    },
    [cardByLead, stageById, move],
  );

  const draggingStage = dragging ? stageById.get(dragging.entry.stageId) : undefined;

  return (
    <DndContext
      sensors={sensors}
      accessibility={{ announcements }}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      <div className="flex h-full min-h-0 gap-3 overflow-x-auto p-3">
        {columnStages.map((stage) => (
          <KanbanColumn
            key={stage.id}
            stage={stage}
            stages={stages}
            cards={buckets.get(stage.id) ?? []}
            summary={summaryByStage.get(stage.id)}
            sellersById={sellersById}
            showSeller={showSeller}
            chipsByLead={chipsByLead}
            funnelId={funnelId}
            highlightLeadId={highlightLeadId}
            onGoToFunnel={onGoToFunnel}
            onFilterOverdue={onFilterOverdue}
            onMove={handleMoveById}
            entryThreshold={entryThreshold}
            onTriageInList={onTriageInList}
          />
        ))}
      </div>

      {/* A floating copy at 1.02 with a shadow. The original stays where it is,
          so nothing in the column shifts while the card is in the air. */}
      <DragOverlay>
        {dragging && draggingStage && (
          <div className="w-72 scale-[1.02] shadow-lg">
            <BoardCard
              card={dragging}
              stage={draggingStage}
              stages={stages}
              showSeller={false}
              chips={chipsByLead.get(dragging.lead.id) ?? NO_CHIPS}
              onOpen={() => {}}
              onMove={() => {}}
            />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
