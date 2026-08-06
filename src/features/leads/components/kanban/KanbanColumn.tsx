import type { DragEvent } from "react";
import { useState } from "react";
import type { ID, IFunnelBoardSummary, ILeadFunnelStage, ISeller } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { getAccentClasses } from "@/features/funnels/engine/accentClasses";
import type { IBoardCard } from "@/features/funnels/engine/boardBuckets";
import { LeadCard } from "../LeadCard";
import { LEADS_STRINGS } from "../../i18n/pt-BR";

export interface IKanbanColumnProps {
  stage: ILeadFunnelStage;
  cards: IBoardCard[];
  /** Server-side aggregate; absent while the query is in flight. */
  summary: IFunnelBoardSummary | undefined;
  sellersById: Map<ID, ISeller>;
  isDropTarget: boolean;
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
  onDragOver,
  onDrop,
  onCardDragStart,
  onCardDragEnd,
}: IKanbanColumnProps) {
  const [hover, setHover] = useState(false);
  const count = summary?.count ?? cards.length;

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
      {/*
        The accent and the neutral separator are two DIFFERENT border-color
        utilities that must not land on the same element — `border-border`
        (bottom separator) and `border-funnel-N` (top edge) both set color on
        every side by default, so stacking them on one `header` made the
        result depend on Tailwind's CSS emission order. A dedicated top bar
        (background, not border) keeps the two fully independent: a 3px
        coloured top edge and a neutral 1px bottom separator.

        The slot now comes from the stage itself — `lead_funnel_stages.accent`
        — so the hex-to-slot translation the legacy pipeline needed is gone.
      */}
      <div className="overflow-hidden rounded-t-lg">
        <div className={cn("h-[3px]", getAccentClasses(stage.accent).bar)} />
        <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold uppercase tracking-wide text-foreground">
              {stage.name}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {LEADS_STRINGS.kanban.columnCount(count)}
            </p>
          </div>
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
            {count}
          </span>
        </header>
      </div>

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
