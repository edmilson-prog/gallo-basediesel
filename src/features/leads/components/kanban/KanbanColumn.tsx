import type { DragEvent } from "react";
import { useMemo, useState } from "react";
import type { ID, IFunnelBoardSummary, ILeadFunnelStage, ISeller } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import type { IBoardCard } from "@/features/funnels/engine/boardBuckets";
import { resolveColumnStats } from "@/features/funnels/engine/columnStats";
import { LeadCard } from "../LeadCard";
import { LEADS_STRINGS } from "../../i18n/pt-BR";
import { ColumnHeader } from "./ColumnHeader";

export interface IKanbanColumnProps {
  stage: ILeadFunnelStage;
  cards: IBoardCard[];
  /** Server-side aggregate; absent while the query is in flight. */
  summary: IFunnelBoardSummary | undefined;
  sellersById: Map<ID, ISeller>;
  isDropTarget: boolean;
  onFilterOverdue: () => void;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDrop: (e: DragEvent<HTMLDivElement>, stage: ILeadFunnelStage) => void;
  onCardDragStart: (e: DragEvent<HTMLDivElement>, leadId: ID) => void;
  onCardDragEnd: (e: DragEvent<HTMLDivElement>) => void;
}

export function KanbanColumn({
  stage,
  cards,
  summary,
  sellersById,
  isDropTarget,
  onFilterOverdue,
  onDragOver,
  onDrop,
  onCardDragStart,
  onCardDragEnd,
}: IKanbanColumnProps) {
  const [hover, setHover] = useState(false);
  const stats = useMemo(
    () => resolveColumnStats({ cards, summary, now: new Date() }),
    [cards, summary],
  );
  const count = stats.count;

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
      <ColumnHeader stage={stage} stats={stats} onFilterOverdue={onFilterOverdue} />
      <div className="flex-1 space-y-2 overflow-y-auto p-2">
        {cards.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-3 py-6 text-center text-[11px] text-muted-foreground">
            <Icon icon="mdi:tray-arrow-down" size={20} />
            <span>{LEADS_STRINGS.kanban.emptyColumn}</span>
          </div>
        ) : (
          cards.map(({ lead }) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              seller={lead.sellerId ? sellersById.get(lead.sellerId) : undefined}
              onDragStart={onCardDragStart}
              onDragEnd={onCardDragEnd}
            />
          ))
        )}
      </div>
    </div>
  );
}
