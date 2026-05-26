import type { DragEvent } from "react";
import { useState } from "react";
import type { ID, ILead, IPipelineStage, ISeller } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { LeadCard } from "../LeadCard";
import { LEADS_STRINGS } from "../../i18n/pt-BR";

export interface IKanbanColumnProps {
  stage: IPipelineStage;
  leads: ILead[];
  sellersById: Map<ID, ISeller>;
  count: number;
  averageDays: number;
  isDropTarget: boolean;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDrop: (e: DragEvent<HTMLDivElement>, stage: IPipelineStage) => void;
  onCardDragStart: (e: DragEvent<HTMLDivElement>, leadId: ID) => void;
  onCardDragEnd: (e: DragEvent<HTMLDivElement>) => void;
}

export function KanbanColumn({
  stage,
  leads,
  sellersById,
  count,
  averageDays,
  isDropTarget,
  onDragOver,
  onDrop,
  onCardDragStart,
  onCardDragEnd,
}: IKanbanColumnProps) {
  const [hover, setHover] = useState(false);

  return (
    <div
      className={cn(
        "flex h-full min-h-0 w-72 shrink-0 flex-col rounded-lg border border-border bg-card",
        (isDropTarget || hover) && "border-primary bg-accent/40",
      )}
      onDragOver={(e) => {
        onDragOver(e);
        setHover(true);
      }}
      onDragLeave={() => setHover(false)}
      onDrop={(e) => {
        onDrop(e, stage);
        setHover(false);
      }}
      aria-label={`Coluna ${stage.name}, ${count} ${count === 1 ? "lead" : "leads"}`}
    >
      <header
        className="flex items-center justify-between gap-2 border-b border-border px-3 py-2"
        style={{
          borderTop: `3px solid ${stage.color}`,
          borderTopLeftRadius: 8,
          borderTopRightRadius: 8,
        }}
      >
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold uppercase tracking-wide text-foreground">
            {stage.name}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {LEADS_STRINGS.kanban.columnCount(count)}
            {averageDays > 0 && <> · {LEADS_STRINGS.kanban.averageDays(averageDays)}</>}
          </p>
        </div>
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[10px] font-semibold text-muted-foreground">
          {count}
        </span>
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto p-2">
        {leads.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-3 py-6 text-center text-[11px] text-muted-foreground">
            <Icon icon="mdi:tray-arrow-down" size={20} />
            <span>{LEADS_STRINGS.kanban.emptyColumn}</span>
          </div>
        ) : (
          leads.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              seller={sellersById.get(lead.sellerId)}
              onDragStart={onCardDragStart}
              onDragEnd={onCardDragEnd}
            />
          ))
        )}
      </div>
    </div>
  );
}
