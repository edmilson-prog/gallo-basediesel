import { useCallback, useMemo, useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
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
import { bucketLeadsByStage } from "@/features/funnels/engine/boardBuckets";
import { LEADS_STRINGS } from "../../i18n/pt-BR";
import { KanbanColumn } from "./KanbanColumn";

export interface ILeadsKanbanProps {
  leads: ILead[];
  /** The active funnel's stages — never the store's legacy pipeline. */
  stages: ILeadFunnelStage[];
  entriesByLead: Map<ID, ILeadFunnelEntry>;
  summaryByStage: Map<ID, IFunnelBoardSummary>;
  funnelId: ID;
  sellersById: Map<ID, ISeller>;
  /** False when the board is already scoped to a single seller. */
  showSeller: boolean;
  onLeadMoved: (lead: ILead, toStage: ILeadFunnelStage) => void;
  /** Dropped on a won/lost stage — the host opens the decision modal. */
  onRequestClose: (lead: ILead) => void;
  /** The column header's overdue count is a filter, not a label. */
  onFilterOverdue: () => void;
}

export function LeadsKanban({
  leads,
  stages,
  entriesByLead,
  summaryByStage,
  funnelId,
  sellersById,
  showSeller,
  onLeadMoved,
  onRequestClose,
  onFilterOverdue,
}: ILeadsKanbanProps) {
  const provider = useLeadFunnelsProvider();
  const queryClient = useQueryClient();
  const [dropTargetId, setDropTargetId] = useState<ID | null>(null);
  const draggedRef = useRef<ID | null>(null);

  const buckets = useMemo(
    () => bucketLeadsByStage({ leads, entriesByLead, stages }),
    [leads, entriesByLead, stages],
  );

  const cardByLead = useMemo(() => {
    const map = new Map<ID, { lead: ILead; entry: ILeadFunnelEntry }>();
    for (const bucket of buckets.values()) for (const card of bucket) map.set(card.lead.id, card);
    return map;
  }, [buckets]);

  const handleCardDragStart = useCallback((e: DragEvent<HTMLDivElement>, leadId: ID) => {
    draggedRef.current = leadId;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/lead-id", leadId);
  }, []);

  const handleCardDragEnd = useCallback(() => {
    draggedRef.current = null;
    setDropTargetId(null);
  }, []);

  const handleDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>, stageId: ID) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (dropTargetId !== stageId) setDropTargetId(stageId);
    },
    [dropTargetId],
  );

  const handleDrop = useCallback(
    async (e: DragEvent<HTMLDivElement>, stage: ILeadFunnelStage) => {
      e.preventDefault();
      setDropTargetId(null);
      const leadId = e.dataTransfer.getData("text/lead-id") || draggedRef.current;
      if (!leadId) return;
      const card = cardByLead.get(leadId);
      if (!card || card.entry.stageId === stage.id) return;

      // No longer compares against CLOSING_STAGE_ID, a constant in the code:
      // the stage's own `kind` carries the meaning, and every funnel has one.
      if (stage.kind === "ganho" || stage.kind === "perda") {
        onRequestClose(card.lead);
        return;
      }

      try {
        // moveEntry, not leads.update: with N:N the board alters ONLY this
        // funnel's participation. The lead's other funnels are untouched.
        await provider.moveEntry(card.entry.id, stage.id);
        auditLog({
          action: "lead_funnel_entry.stage_changed",
          resource: "lead",
          resourceId: card.lead.id,
          before: { stageId: card.entry.stageId },
          after: { stageId: stage.id },
        });
        toast.success(LEADS_STRINGS.toasts.moved(stage.name));
        onLeadMoved(card.lead, stage);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["lead-funnel-entries", funnelId] }),
          queryClient.invalidateQueries({ queryKey: ["lead-funnel-board-summary", funnelId] }),
        ]);
      } catch {
        toast.error(LEADS_STRINGS.toasts.moveError);
      }
    },
    [cardByLead, provider, queryClient, funnelId, onLeadMoved, onRequestClose],
  );

  return (
    <div className="flex h-full min-h-0 gap-3 overflow-x-auto p-3">
      {stages.map((stage) => (
        <KanbanColumn
          key={stage.id}
          stage={stage}
          cards={buckets.get(stage.id) ?? []}
          summary={summaryByStage.get(stage.id)}
          sellersById={sellersById}
          showSeller={showSeller}
          isDropTarget={dropTargetId === stage.id}
          onFilterOverdue={onFilterOverdue}
          onDragOver={(e) => handleDragOver(e, stage.id)}
          onDrop={(e, st) => void handleDrop(e, st)}
          onCardDragStart={handleCardDragStart}
          onCardDragEnd={handleCardDragEnd}
        />
      ))}
    </div>
  );
}
