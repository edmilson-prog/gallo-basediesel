import { useCallback, useMemo, useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import type { ID, ILead, IPipelineStage, ISeller } from "@/shared/types";
import { auditLog } from "@/features/rbac/utils/auditLog";
import { useLeadsProvider } from "@/providers/data/hooks/useLeadsProvider";
import { computeStageMetrics } from "../../utils/leadMetrics";
import { CLOSING_STAGE_ID } from "../../utils/leadDisplay";
import { LEADS_STRINGS } from "../../i18n/pt-BR";
import { KanbanColumn } from "./KanbanColumn";

export interface ILeadsKanbanProps {
  leads: ILead[];
  stages: IPipelineStage[];
  sellersById: Map<ID, ISeller>;
  onLeadMoved: (lead: ILead, toStage: IPipelineStage) => void;
  /** Called when dropped on the closing stage — host opens the convert/lost decision modal. */
  onRequestClose: (lead: ILead) => void;
}

export function LeadsKanban({
  leads,
  stages,
  sellersById,
  onLeadMoved,
  onRequestClose,
}: ILeadsKanbanProps) {
  const provider = useLeadsProvider();
  const queryClient = useQueryClient();
  const [dropTargetId, setDropTargetId] = useState<ID | null>(null);
  const draggedRef = useRef<ILead | null>(null);

  const leadsByStage = useMemo(() => {
    const map = new Map<ID, ILead[]>();
    stages.forEach((s) => map.set(s.id, []));
    leads.forEach((l) => {
      const bucket = map.get(l.stage.id);
      if (bucket) bucket.push(l);
      else map.set(l.stage.id, [l]);
    });
    return map;
  }, [leads, stages]);

  const metricsByStage = useMemo(() => {
    const map = new Map<ID, { count: number; averageDays: number }>();
    stages.forEach((s) => {
      const metrics = computeStageMetrics(leads, s.id);
      map.set(s.id, { count: metrics.count, averageDays: metrics.averageDays });
    });
    return map;
  }, [leads, stages]);

  const handleCardDragStart = useCallback(
    (e: DragEvent<HTMLDivElement>, leadId: ID) => {
      const lead = leads.find((l) => l.id === leadId);
      if (!lead) return;
      draggedRef.current = lead;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/lead-id", leadId);
    },
    [leads],
  );

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
    async (e: DragEvent<HTMLDivElement>, stage: IPipelineStage) => {
      e.preventDefault();
      setDropTargetId(null);
      const leadId = e.dataTransfer.getData("text/lead-id") || draggedRef.current?.id;
      if (!leadId) return;
      const lead = leads.find((l) => l.id === leadId);
      if (!lead) return;
      if (lead.stage.id === stage.id) return;

      if (stage.id === CLOSING_STAGE_ID) {
        onRequestClose(lead);
        return;
      }

      try {
        const updated = await provider.update(lead.id, { stage });
        auditLog({
          action: "lead.stage_changed",
          resource: "lead",
          resourceId: lead.id,
          before: { stageId: lead.stage.id },
          after: { stageId: stage.id },
        });
        toast.success(LEADS_STRINGS.toasts.moved(stage.name));
        onLeadMoved(updated, stage);
        await queryClient.invalidateQueries({ queryKey: ["leads-list"] });
      } catch {
        toast.error(LEADS_STRINGS.toasts.moveError);
      }
    },
    [leads, provider, queryClient, onLeadMoved, onRequestClose],
  );

  return (
    <div className="flex h-full min-h-0 gap-3 overflow-x-auto p-3">
      {stages.map((stage) => {
        const stageLeads = leadsByStage.get(stage.id) ?? [];
        const stageMetrics = metricsByStage.get(stage.id) ?? { count: 0, averageDays: 0 };
        return (
          <KanbanColumn
            key={stage.id}
            stage={stage}
            leads={stageLeads}
            sellersById={sellersById}
            count={stageMetrics.count}
            averageDays={stageMetrics.averageDays}
            isDropTarget={dropTargetId === stage.id}
            onDragOver={(e) => handleDragOver(e, stage.id)}
            onDrop={(e, st) => void handleDrop(e, st)}
            onCardDragStart={handleCardDragStart}
            onCardDragEnd={handleCardDragEnd}
          />
        );
      })}
    </div>
  );
}
