import type { DragEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import type { ID, IFunnelBoardSummary, ILeadFunnelStage, ISeller } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import type { IBoardCard } from "@/features/funnels/engine/boardBuckets";
import { resolveColumnStats } from "@/features/funnels/engine/columnStats";
import { defaultSortForKind, sortBoardCards } from "@/features/funnels/engine/boardSort";
import type { ILeadFunnelChip } from "@/features/funnels/hooks/useLeadFunnelChips";
import { useColumnPreferences } from "../../hooks/useColumnPreferences";
import { LEADS_STRINGS } from "../../i18n/pt-BR";
import { BoardCard } from "./BoardCard";
import { CollapsedColumn } from "./CollapsedColumn";
import { ColumnHeader } from "./ColumnHeader";
import { ColumnMenu } from "./ColumnMenu";

/** 40 cards, then "carregar mais" — see the note on the `visible` state. */
const PAGE = 40;

/** Stable identity so a lead with no chips does not re-render on every pass. */
const NO_CHIPS: ILeadFunnelChip[] = [];

export interface IKanbanColumnProps {
  stage: ILeadFunnelStage;
  cards: IBoardCard[];
  /** Server-side aggregate; absent while the query is in flight. */
  summary: IFunnelBoardSummary | undefined;
  sellersById: Map<ID, ISeller>;
  /** False when the board is already scoped to a single seller. */
  showSeller: boolean;
  chipsByLead: Map<ID, ILeadFunnelChip[]>;
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
  showSeller,
  chipsByLead,
  isDropTarget,
  onFilterOverdue,
  onDragOver,
  onDrop,
  onCardDragStart,
  onCardDragEnd,
}: IKanbanColumnProps) {
  const navigate = useNavigate();
  const [hover, setHover] = useState(false);
  const { sortByStage, collapsedByStage, setSort, toggleCollapsed } = useColumnPreferences();

  const stats = useMemo(
    () => resolveColumnStats({ cards, summary, now: new Date() }),
    [cards, summary],
  );
  const count = stats.count;

  const mode = sortByStage[stage.id] ?? defaultSortForKind(stage.kind);
  const sorted = useMemo(() => sortBoardCards(cards, mode, new Date()), [cards, mode]);

  // Legitimately per-instance: each column owns its own window, and no sibling
  // needs to see it. Virtualisation was weighed and dropped — it fights the
  // drag (targets outside the rendered window need auto-scroll and remeasuring),
  // breaks the browser's Ctrl+F, and does not touch the human problem: nine
  // hundred virtualised cards are still nine hundred cards nobody will read.
  const [visible, setVisible] = useState(PAGE);

  // Sorting, filtering or a funnel switch change the set. The window goes back
  // to the top, otherwise the column would open already scrolled into a set the
  // person never asked for.
  useEffect(() => setVisible(PAGE), [mode, sorted.length, stage.id]);

  const shown = useMemo(() => sorted.slice(0, visible), [sorted, visible]);

  if (collapsedByStage[stage.id]) {
    return (
      <CollapsedColumn
        stage={stage}
        count={count}
        isDropTarget={isDropTarget}
        onExpand={() => toggleCollapsed(stage.id)}
        onDragOver={onDragOver}
        onDrop={onDrop}
      />
    );
  }

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
      <ColumnHeader
        stage={stage}
        stats={stats}
        onFilterOverdue={onFilterOverdue}
        menu={
          <ColumnMenu
            stage={stage}
            mode={mode}
            onSortChange={(m) => setSort(stage.id, m)}
            onToggleCollapsed={() => toggleCollapsed(stage.id)}
          />
        }
      />
      <div className="flex-1 space-y-2 overflow-y-auto p-2">
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-3 py-6 text-center text-[11px] text-muted-foreground">
            <Icon icon="mdi:tray-arrow-down" size={20} />
            <span>{LEADS_STRINGS.kanban.emptyColumn}</span>
          </div>
        ) : (
          <>
            {shown.map((boardCard) => (
              <BoardCard
                key={boardCard.lead.id}
                card={boardCard}
                stage={stage}
                seller={
                  boardCard.lead.sellerId ? sellersById.get(boardCard.lead.sellerId) : undefined
                }
                showSeller={showSeller}
                chips={chipsByLead.get(boardCard.lead.id) ?? NO_CHIPS}
                onOpen={(id) => void navigate({ to: "/app/leads/$id", params: { id } })}
                onDragStart={onCardDragStart}
                onDragEnd={onCardDragEnd}
              />
            ))}
            {sorted.length > visible && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs"
                onClick={() => setVisible((v) => v + PAGE)}
              >
                {LEADS_STRINGS.kanban.loadMore(Math.min(PAGE, sorted.length - visible))}
                <span className="ml-1 text-muted-foreground">
                  ({LEADS_STRINGS.kanban.showingOf(visible, sorted.length)})
                </span>
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
