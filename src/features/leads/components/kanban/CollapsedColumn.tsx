import type { DragEvent } from "react";
import type { ILeadFunnelStage } from "@/shared/types";
import { cn } from "@/lib/utils";
import { getAccentClasses } from "@/features/funnels/engine/accentClasses";
import { LEADS_STRINGS } from "../../i18n/pt-BR";

export interface ICollapsedColumnProps {
  stage: ILeadFunnelStage;
  count: number;
  isDropTarget: boolean;
  onExpand: () => void;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDrop: (e: DragEvent<HTMLDivElement>, stage: ILeadFunnelStage) => void;
}

/**
 * A column reduced to 44px, name turned on its side.
 *
 * It stays a drop target: collapsing is a way to save width, not to take the
 * stage out of play, and a board where you cannot drop into a folded column
 * would force the user to unfold just to move one card.
 */
export function CollapsedColumn({
  stage,
  count,
  isDropTarget,
  onExpand,
  onDragOver,
  onDrop,
}: ICollapsedColumnProps) {
  return (
    <div
      onDragOver={onDragOver}
      onDrop={(e) => onDrop(e, stage)}
      className={cn(
        "flex h-full w-11 shrink-0 flex-col items-center gap-2 overflow-hidden rounded-lg border border-border bg-card py-2",
        isDropTarget && "border-primary bg-accent/40",
      )}
    >
      <button
        type="button"
        onClick={onExpand}
        aria-label={`${LEADS_STRINGS.kanban.expand} — ${stage.name}`}
        className="flex min-h-0 flex-1 flex-col items-center gap-2 rounded transition hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {/* Accent as background on its own strip — never as a border colour. */}
        <span
          aria-hidden
          className={cn("h-[3px] w-6 shrink-0 rounded-full", getAccentClasses(stage.accent).bar)}
        />
        <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-muted px-1 text-[10px] font-semibold tabular-nums text-muted-foreground">
          {count}
        </span>
        <span
          className="min-h-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
          style={{ writingMode: "vertical-rl" }}
        >
          {stage.name}
        </span>
      </button>
    </div>
  );
}
