import type { ID } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { getAccentClasses } from "@/features/funnels/engine/accentClasses";
import type { IFunnelReadout, IReadoutSegment } from "@/features/funnels/engine/funnelReadout";
import { formatBRLCompact } from "@/shared/utils/format";
import { LEADS_STRINGS } from "../i18n/pt-BR";

const COPY = LEADS_STRINGS.readout;

export interface IFunnelReadoutProps {
  readout: IFunnelReadout;
  /** Stage filter currently applied, so a segment can show as selected. */
  activeStageIds: ID[];
  /** Clicking a segment narrows to that stage — clicking it again clears. */
  onToggleStage: (stageId: ID) => void;
  /** Outcomes have no column any more, so they open the list scoped to them. */
  onOpenOutcome: (stageId: ID) => void;
  onFilterOverdue: () => void;
}

/**
 * The shape of the funnel, in one strip, above the board.
 *
 * Six equal-width columns answer "quais são as etapas" and hide the only thing
 * a pipeline exists to show — where the work is stuck. Here the bar is
 * proportional, so 97% parked on the entry stage is the first thing anybody
 * sees rather than something they deduce by counting cards, and the sentence
 * beside it says in Portuguese what the bar draws.
 *
 * Convertido and Perdido leave the board entirely. They are outcomes, not
 * stages of work: 0 and 1.782 are numbers to read, not piles to drag into, and
 * as columns they were spending a third of the width on leads nobody touches.
 */
export function FunnelReadout({
  readout,
  activeStageIds,
  onToggleStage,
  onOpenOutcome,
  onFilterOverdue,
}: IFunnelReadoutProps) {
  const { segments, outcomes, activeCount, workedCount, entryShare, overdueCount, entry } =
    readout;

  if (segments.length === 0) return null;

  return (
    <div className="flex flex-wrap items-stretch gap-x-5 gap-y-3 border-b border-border bg-card px-4 py-3">
      <div className="min-w-0 flex-[1_1_28rem]">
        <p className="mb-2 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
          <span className="text-lg font-semibold tabular-nums leading-none text-foreground">
            {COPY.activeLeads(activeCount)}
          </span>
          <span className="text-sm text-foreground/80">{COPY.activeLabel(activeCount)}</span>
          {entry && entryShare > 0 && (
            <>
              <span aria-hidden>·</span>
              <span>
                <b className="font-semibold text-severity-critical">
                  {COPY.stuckAtEntry(entryShare)}
                </b>
              </span>
            </>
          )}
          <span aria-hidden>·</span>
          <span>
            <b className="font-semibold tabular-nums text-foreground">{COPY.inWork(workedCount)}</b>{" "}
            {COPY.inWorkLabel}
          </span>
          {overdueCount > 0 && (
            <>
              <span aria-hidden>,</span>
              <button
                type="button"
                onClick={onFilterOverdue}
                title={COPY.overdueHint}
                className="rounded font-semibold text-severity-critical underline underline-offset-2 hover:text-severity-critical/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {COPY.overdue(overdueCount)}
              </button>
            </>
          )}
        </p>

        <div className="flex items-stretch gap-1">
          {segments.map((segment) => (
            <Segment
              key={segment.stage.id}
              segment={segment}
              selected={activeStageIds.includes(segment.stage.id)}
              onClick={() => onToggleStage(segment.stage.id)}
            />
          ))}
        </div>
      </div>

      {outcomes.length > 0 && (
        <div className="flex items-stretch gap-2">
          {outcomes.map((outcome) => (
            <Outcome
              key={outcome.stage.id}
              segment={outcome}
              onClick={() => onOpenOutcome(outcome.stage.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface ISegmentProps {
  segment: IReadoutSegment;
  selected: boolean;
  onClick: () => void;
}

function Segment({ segment, selected, onClick }: ISegmentProps) {
  const { stage, count, sumValue, share } = segment;
  const accent = getAccentClasses(stage.accent);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-pressed={selected}
          aria-label={COPY.segmentAria(stage.name, count)}
          style={{
            // Proportional, but never invisible: a stage holding 12 of 1.633
            // would round to a 2px sliver nobody can read or click. The basis
            // floor keeps it legible while `flex-grow` still carries the shape.
            flexGrow: Math.max(share, 0.0001),
            flexShrink: 1,
            flexBasis: 0,
          }}
          className={cn(
            "group relative min-w-[5.5rem] overflow-hidden rounded-md border px-2 pb-1.5 pt-2 text-left transition",
            accent.chip,
            selected ? "border-primary" : "border-transparent hover:border-border",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <span
            aria-hidden
            className={cn("absolute inset-x-0 top-0 h-0.5", accent.bar)}
          />
          <span className="block text-sm font-semibold tabular-nums leading-tight text-foreground">
            {count.toLocaleString("pt-BR")}
          </span>
          <span className="block truncate text-[10px] text-muted-foreground">{stage.name}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent>{COPY.segmentTitle(stage.name, formatBRLCompact(sumValue))}</TooltipContent>
    </Tooltip>
  );
}

interface IOutcomeProps {
  segment: IReadoutSegment;
  onClick: () => void;
}

function Outcome({ segment, onClick }: IOutcomeProps) {
  const { stage, count, sumValue } = segment;
  const won = stage.kind === "ganho";
  const hint = won
    ? count === 0
      ? COPY.neverWon
      : formatBRLCompact(sumValue)
    : COPY.archived;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={COPY.outcomeAria(stage.name)}
      className={cn(
        "flex min-w-[7rem] flex-col justify-center gap-0.5 rounded-lg border px-3 py-2 text-left transition hover:bg-accent/40",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        won ? "border-severity-success/30" : "border-severity-critical/30",
      )}
    >
      <span
        className={cn(
          "inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide",
          won ? "text-severity-success" : "text-severity-critical",
        )}
      >
        <Icon icon={won ? "mdi:check-decagram" : "mdi:close-octagon"} size={12} aria-hidden />
        {stage.name}
      </span>
      <span
        className={cn(
          "text-xl font-semibold tabular-nums leading-none",
          // Zero conversions is the finding, not a missing value: it keeps the
          // outcome's own colour instead of fading into the neutral ramp.
          count === 0 && won ? "text-severity-success" : "text-foreground",
        )}
      >
        {count.toLocaleString("pt-BR")}
      </span>
      <span className="truncate text-[11px] text-muted-foreground">{hint}</span>
    </button>
  );
}
