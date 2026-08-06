import type { ReactNode } from "react";
import type { ILeadFunnelStage } from "@/shared/types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { getAccentClasses } from "@/features/funnels/engine/accentClasses";
import type { IColumnStats } from "@/features/funnels/engine/columnStats";
import { formatBRLCompact } from "@/shared/utils/format";
import { LEADS_STRINGS } from "../../i18n/pt-BR";

export interface IColumnHeaderProps {
  stage: ILeadFunnelStage;
  stats: IColumnStats;
  /** Applies `nextAction=overdue` — the one number that makes someone act. */
  onFilterOverdue: () => void;
  /** The `⋮` menu, supplied by the column so this stays presentational. */
  menu?: ReactNode;
}

/**
 * Replaces "N leads · Média X dias" with the value sum and a clickable overdue
 * count. The average moves into the tooltip: it is a report number, not one
 * anybody acts on, and it was costing a whole line of a 60px header.
 */
export function ColumnHeader({ stage, stats, onFilterOverdue, menu }: IColumnHeaderProps) {
  return (
    <div className="overflow-hidden rounded-t-lg">
      {/*
        Accent as BACKGROUND on a dedicated strip, never as a border colour on
        the header — `border-border` and `border-funnel-N` both set every side,
        so stacking them makes the result depend on Tailwind's emission order.
      */}
      <div className={cn("h-[3px]", getAccentClasses(stage.accent).bar)} />
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold uppercase tracking-wide text-foreground">
            {stage.name}
          </p>
          <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="tabular-nums">{formatBRLCompact(stats.sumValue)}</span>
              </TooltipTrigger>
              <TooltipContent>{LEADS_STRINGS.kanban.columnSum}</TooltipContent>
            </Tooltip>
            {stats.overdueCount > 0 && (
              <>
                <span aria-hidden>·</span>
                <button
                  type="button"
                  onClick={onFilterOverdue}
                  title={LEADS_STRINGS.kanban.overdueHint}
                  className="rounded text-severity-warning underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {LEADS_STRINGS.kanban.overdue(stats.overdueCount)}
                </button>
              </>
            )}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                {stats.count}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {LEADS_STRINGS.kanban.averageDaysTooltip(stats.averageDays)}
              {stats.isPartial ? ` · ${LEADS_STRINGS.kanban.partialHint}` : ""}
            </TooltipContent>
          </Tooltip>
          {menu}
        </div>
      </header>
    </div>
  );
}
