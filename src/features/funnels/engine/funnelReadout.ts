import type { ID, IFunnelBoardSummary, ILeadFunnelStage, Money } from "@/shared/types";
import { isClosingKind } from "./stageKind";

export interface IFunnelReadoutInput {
  /** The funnel's stages, already ordered by `position`. */
  stages: ILeadFunnelStage[];
  /** Server-side aggregate per stage; a stage absent from it counts as zero. */
  summaryByStage: Map<ID, IFunnelBoardSummary>;
}

export interface IReadoutSegment {
  stage: ILeadFunnelStage;
  count: number;
  sumValue: Money;
  overdueCount: number;
  /**
   * Share of the ACTIVE total, 0–100. Zero for outcomes: they are not part of
   * the bar, and dividing them by the active total would draw a pipeline that
   * sums past 100%.
   */
  share: number;
}

export interface IFunnelReadout {
  /** Work stages — entrada + aberta, in funnel order. These form the bar. */
  segments: IReadoutSegment[];
  /** Terminal stages — ganho + perda, in funnel order. These form the score. */
  outcomes: IReadoutSegment[];
  /** The entry stage, when the funnel has one. */
  entry: IReadoutSegment | null;
  /** Leads sitting on a work stage — what is still in the pipeline. */
  activeCount: number;
  /** Active leads that have left the entry stage. The number worth reading. */
  workedCount: number;
  /** Percentage of the active total still parked on entry, rounded. */
  entryShare: number;
  /** Overdue next actions across the WORK stages only. */
  overdueCount: number;
  /** True when at least one stage had no server aggregate to read. */
  isPartial: boolean;
}

const EMPTY: IFunnelReadout = {
  segments: [],
  outcomes: [],
  entry: null,
  activeCount: 0,
  workedCount: 0,
  entryShare: 0,
  overdueCount: 0,
  isPartial: false,
};

/**
 * What the board never said out loud.
 *
 * Six columns of equal width answer "quais são as etapas". They do not answer
 * the only question a pipeline exists to answer — where the work is stuck — and
 * two of those columns (Convertido, Perdido) took a third of the screen to
 * report outcomes nobody drags a card into. This splits the funnel into the
 * part you work and the part you read, and computes the three numbers the
 * diagnosis needs: how many are active, how many actually moved past the front
 * door, and how many are late.
 *
 * The aggregates come from `getBoardSummary`, never from counting loaded cards:
 * a column paginated at forty out of nine hundred would draw a bar describing
 * the page instead of the funnel.
 */
export function resolveFunnelReadout({
  stages,
  summaryByStage,
}: IFunnelReadoutInput): IFunnelReadout {
  if (stages.length === 0) return EMPTY;

  let isPartial = false;

  const read = (stage: ILeadFunnelStage) => {
    const summary = summaryByStage.get(stage.id);
    if (!summary) isPartial = true;
    return {
      stage,
      count: summary?.count ?? 0,
      sumValue: summary?.sumValue ?? 0,
      overdueCount: summary?.overdueCount ?? 0,
      share: 0,
    };
  };

  const work = stages.filter((s) => !isClosingKind(s.kind)).map(read);
  const outcomes = stages.filter((s) => isClosingKind(s.kind)).map(read);

  const activeCount = work.reduce((sum, s) => sum + s.count, 0);
  const overdueCount = work.reduce((sum, s) => sum + s.overdueCount, 0);

  // A funnel is not required to have an entry stage — the admin can model one
  // without it — so this is a lookup, not an assumption about position 0.
  const entry = work.find((s) => s.stage.kind === "entrada") ?? null;
  const workedCount = activeCount - (entry?.count ?? 0);

  const segments = work.map((s) => ({
    ...s,
    // Guarded against an empty funnel: 0/0 is NaN, and NaN reaches the DOM as
    // a flex-grow that silently collapses every segment to nothing.
    share: activeCount === 0 ? 0 : (s.count / activeCount) * 100,
  }));

  return {
    segments,
    outcomes,
    entry: entry ? segments.find((s) => s.stage.id === entry.stage.id) ?? entry : null,
    activeCount,
    workedCount,
    entryShare: activeCount === 0 ? 0 : Math.round(((entry?.count ?? 0) / activeCount) * 100),
    overdueCount,
    isPartial,
  };
}
