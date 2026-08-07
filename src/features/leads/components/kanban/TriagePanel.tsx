import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ITriageView } from "@/features/funnels/engine/triageMode";
import { LEADS_STRINGS } from "../../i18n/pt-BR";

export interface ITriagePanelProps {
  view: ITriageView;
  /** A card is hovering over the column — the panel says it still accepts one. */
  isOver: boolean;
  onTriageInList: () => void;
}

/**
 * What the entry column shows once it has become a warehouse.
 *
 * It replaces the pile of cards, not the header — the sum and the overdue count
 * stay. A pile is not actionable at nine hundred; a count, an age and a way out
 * are.
 *
 * The panel is still inside the column's droppable, so returning a lead to
 * triage keeps working. That movement is legitimate — the lead went into the
 * wrong funnel, the customer went quiet — and a mode that blocked it would
 * leave people without a way back.
 */
export function TriagePanel({ view, isOver, onTriageInList }: ITriagePanelProps) {
  const COPY = LEADS_STRINGS.kanban.triage;

  return (
    <div
      className={cn(
        "m-2 flex flex-col gap-3 rounded-md border border-severity-warning/40 bg-severity-warning/10 p-3",
        isOver && "border-primary bg-accent/60",
      )}
    >
      {isOver ? (
        <p className="flex items-center gap-1.5 py-4 text-center text-xs font-medium text-foreground">
          <Icon icon="mdi:tray-arrow-down" size={16} aria-hidden />
          {COPY.dropHint}
        </p>
      ) : (
        <>
          <div className="space-y-1">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Icon icon="mdi:package-variant-closed" size={14} aria-hidden />
              {COPY.title}
            </p>
            <p className="text-[11px] text-muted-foreground">{COPY.body(view.count)}</p>
            {view.oldestDays !== null && (
              <p className="text-[11px] text-muted-foreground">{COPY.oldest(view.oldestDays)}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Button size="sm" className="w-full" onClick={onTriageInList}>
              <Icon icon="mdi:format-list-checks" size={16} aria-hidden />
              {COPY.toList}
            </Button>

            {/*
              Deliberately a disabled button with an explanation, not an absent
              one. Distributing in bulk goes through the rotation queue, which
              has its own rules about schedule and department — it is a
              subsystem, not a line of code. A button that says "later" is debt
              somebody can see; leaving it out makes the idea disappear too.
            */}
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0} className="w-full">
                  <Button size="sm" variant="outline" className="w-full" disabled>
                    <Icon icon="mdi:account-arrow-right-outline" size={16} aria-hidden />
                    {COPY.distribute}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>{COPY.distributeSoon}</TooltipContent>
            </Tooltip>
          </div>
        </>
      )}
    </div>
  );
}
