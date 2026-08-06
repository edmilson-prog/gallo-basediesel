import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useDroppable } from "@dnd-kit/core";
import { Button } from "@/components/ui/button";
import type { ID, IFunnelBoardSummary, ILeadFunnelStage, ISeller } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import type { IBoardCard } from "@/features/funnels/engine/boardBuckets";
import { resolveColumnStats } from "@/features/funnels/engine/columnStats";
import { defaultSortForKind, sortBoardCards } from "@/features/funnels/engine/boardSort";
import { otherFunnelsFor } from "@/features/funnels/engine/otherFunnels";
import type { ILeadFunnelChip } from "@/features/funnels/hooks/useLeadFunnelChips";
import { useColumnPreferences } from "../../hooks/useColumnPreferences";
import { LEADS_STRINGS } from "../../i18n/pt-BR";
import { BoardCard } from "./BoardCard";
import { CollapsedColumn } from "./CollapsedColumn";
import { ColumnHeader } from "./ColumnHeader";
import { ColumnMenu } from "./ColumnMenu";
import { OtherFunnelsBadge } from "./OtherFunnelsBadge";

/** 40 cards, then "carregar mais" — see the note on the `visible` state. */
const PAGE = 40;

/** Stable identity so a lead with no chips does not re-render on every pass. */
const NO_CHIPS: ILeadFunnelChip[] = [];

export interface IKanbanColumnProps {
  stage: ILeadFunnelStage;
  /** Every stage of this funnel, for the card's "mover para…" menu. */
  stages: ILeadFunnelStage[];
  cards: IBoardCard[];
  /** Server-side aggregate; absent while the query is in flight. */
  summary: IFunnelBoardSummary | undefined;
  sellersById: Map<ID, ISeller>;
  /** False when the board is already scoped to a single seller. */
  showSeller: boolean;
  chipsByLead: Map<ID, ILeadFunnelChip[]>;
  funnelId: ID;
  /** Lead this board was asked to point at, if any. */
  highlightLeadId: ID | undefined;
  onGoToFunnel: (funnelId: ID, leadId: ID) => void;
  onFilterOverdue: () => void;
  onMove: (leadId: ID, stageId: ID) => void;
}

export function KanbanColumn({
  stage,
  stages,
  cards,
  summary,
  sellersById,
  showSeller,
  chipsByLead,
  funnelId,
  highlightLeadId,
  onGoToFunnel,
  onFilterOverdue,
  onMove,
}: IKanbanColumnProps) {
  const navigate = useNavigate();
  const { sortByStage, collapsedByStage, setSort, toggleCollapsed } = useColumnPreferences();

  // Called before any early return — a folded column is still a drop target.
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });

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

  // A lead pointed at from another board may sit past the loaded window —
  // jumping to it and landing on nothing would read as a broken link.
  const highlightIndex = highlightLeadId
    ? sorted.findIndex((c) => c.lead.id === highlightLeadId)
    : -1;
  useEffect(() => {
    if (highlightIndex >= visible) setVisible(Math.ceil((highlightIndex + 1) / PAGE) * PAGE);
  }, [highlightIndex, visible]);

  const shown = useMemo(() => sorted.slice(0, visible), [sorted, visible]);

  if (collapsedByStage[stage.id]) {
    return (
      <CollapsedColumn
        ref={setNodeRef}
        stage={stage}
        count={count}
        isDropTarget={isOver}
        onExpand={() => toggleCollapsed(stage.id)}
      />
    );
  }

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex h-full min-h-0 w-72 shrink-0 flex-col rounded-lg border border-border bg-card",
        isOver && "border-primary bg-accent/40",
      )}
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
                stages={stages}
                seller={
                  boardCard.lead.sellerId ? sellersById.get(boardCard.lead.sellerId) : undefined
                }
                showSeller={showSeller}
                chips={chipsByLead.get(boardCard.lead.id) ?? NO_CHIPS}
                highlighted={boardCard.lead.id === highlightLeadId}
                indicator={
                  <OtherFunnelsBadge
                    others={otherFunnelsFor(chipsByLead.get(boardCard.lead.id), funnelId)}
                    onGo={(target) => onGoToFunnel(target, boardCard.lead.id)}
                  />
                }
                onOpen={(id) => void navigate({ to: "/app/leads/$id", params: { id } })}
                onMove={onMove}
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
