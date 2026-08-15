import { useDroppable } from "@dnd-kit/core";
import type { ILeadFunnelStage } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ITriageView } from "@/features/funnels/engine/triageMode";
import { LEADS_STRINGS } from "../../i18n/pt-BR";

const COPY = LEADS_STRINGS.kanban.triage;

export interface ITriageBandProps {
  stage: ILeadFunnelStage;
  view: ITriageView;
  onTriageInList: () => void;
}

/**
 * The entry stage once it has become a warehouse.
 *
 * It used to be a 288px column holding a panel that said "903 leads parados"
 * and offered a disabled button. Nobody drags nine hundred cards, so the pile
 * was never the point — the count, the age and the way out were, and none of
 * the three fitted in a column that narrow.
 *
 * As a full-width band it gets the room to say all of it, and gives the width
 * back to the columns that actually hold work.
 *
 * It stays a drop target. Returning a lead to triage is legitimate — it went
 * into the wrong funnel, the customer went quiet — and a mode that blocked it
 * would leave people without a way back.
 */
export function TriageBand({ stage, view, onTriageInList }: ITriageBandProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border px-4 py-3 transition",
        isOver
          ? "border-primary bg-accent/60"
          : "border-severity-warning/40 bg-severity-warning/10",
      )}
    >
      <span
        aria-hidden
        className="grid size-9 shrink-0 place-items-center rounded-md bg-severity-warning/15 text-severity-warning"
      >
        <Icon icon="mdi:package-variant-closed" size={18} />
      </span>

      {isOver ? (
        <p className="flex items-center gap-1.5 py-1 text-sm font-medium text-foreground">
          <Icon icon="mdi:tray-arrow-down" size={16} aria-hidden />
          {COPY.bandDropHint}
        </p>
      ) : (
        <>
          <div className="min-w-0 flex-[1_1_22rem]">
            <p className="text-sm font-semibold text-foreground">
              {COPY.bandTitle(stage.name, view.count)}
            </p>
            <p className="text-xs text-pretty text-muted-foreground">
              {view.oldestDays !== null && (
                <>
                  <span className="font-medium text-severity-warning">
                    {COPY.bandOldest(view.oldestDays)}
                  </span>{" "}
                </>
              )}
              {COPY.bandBody}
            </p>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            {/*
              Deliberately a disabled button with an explanation, not an absent
              one. Distributing in bulk goes through the rotation queue, which
              has its own rules about schedule and department — it is a
              subsystem, not a line of code. A button that says "later" is debt
              somebody can see; leaving it out makes the idea disappear too.
            */}
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0}>
                  <Button size="sm" variant="outline" disabled>
                    <Icon icon="mdi:account-arrow-right-outline" size={16} aria-hidden />
                    {COPY.distribute}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>{COPY.distributeSoon}</TooltipContent>
            </Tooltip>

            <Button size="sm" onClick={onTriageInList}>
              <Icon icon="mdi:format-list-checks" size={16} aria-hidden />
              {COPY.toList}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
