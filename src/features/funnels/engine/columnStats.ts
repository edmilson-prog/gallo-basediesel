import type { IFunnelBoardSummary, Money } from "@/shared/types";
import type { IBoardCard } from "./boardBuckets";

export interface IColumnStatsInput {
  cards: IBoardCard[];
  summary: IFunnelBoardSummary | undefined;
  now: Date;
}

export interface IColumnStats {
  count: number;
  sumValue: Money;
  overdueCount: number;
  /** Always local: the server aggregate carries no average. */
  averageDays: number;
  /** true when the numbers describe only what is loaded. */
  isPartial: boolean;
}

const DAY_MS = 86_400_000;

/**
 * The column header's numbers.
 *
 * The server aggregate wins whenever it exists: with pagination the client
 * holds 40 of 903, and counting what is in memory would print "40" at the top
 * of a column of nine hundred.
 *
 * The average is the exception — `getBoardSummary` does not compute one, so it
 * always describes the loaded set. That is why it lives in the tooltip and not
 * next to the count.
 */
export function resolveColumnStats({ cards, summary, now }: IColumnStatsInput): IColumnStats {
  const nowMs = now.getTime();

  let localSum = 0;
  let localOverdue = 0;
  let daysTotal = 0;

  for (const { lead, entry } of cards) {
    localSum += entry.estimatedValue ?? 0;
    if (lead.nextActionAt && new Date(lead.nextActionAt).getTime() < nowMs) localOverdue += 1;
    daysTotal += Math.max(
      0,
      Math.floor((nowMs - new Date(entry.enteredStageAt).getTime()) / DAY_MS),
    );
  }

  const averageDays = cards.length === 0 ? 0 : Math.round((daysTotal / cards.length) * 10) / 10;

  if (summary) {
    return {
      count: summary.count,
      sumValue: summary.sumValue,
      overdueCount: summary.overdueCount,
      averageDays,
      isPartial: false,
    };
  }

  return {
    count: cards.length,
    sumValue: localSum,
    overdueCount: localOverdue,
    averageDays,
    isPartial: true,
  };
}
