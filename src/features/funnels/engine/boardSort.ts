import type { LeadFunnelStageKind } from "@/shared/types";
import type { IBoardCard } from "./boardBuckets";

export const BOARD_SORT_MODES = [
  "oldest",
  "newest",
  "nextAction",
  "highestValue",
  "stalest",
] as const;

export type BoardSortMode = (typeof BOARD_SORT_MODES)[number];

/**
 * On the entry stage, oldest first.
 *
 * The board sits in descending creation order today, which puts the forgotten
 * lead last among nine hundred — precisely the one nobody scrolls to. Every
 * other stage sorts by next action, where the commitment is the ordering.
 */
export function defaultSortForKind(kind: LeadFunnelStageKind): BoardSortMode {
  return kind === "entrada" ? "oldest" : "nextAction";
}

const ms = (iso: string | undefined, fallback: number): number =>
  iso ? new Date(iso).getTime() : fallback;

export function sortBoardCards(
  cards: IBoardCard[],
  mode: BoardSortMode,
  now: Date,
): IBoardCard[] {
  const nowMs = now.getTime();
  const copy = [...cards];

  switch (mode) {
    case "oldest":
      return copy.sort((a, b) => ms(a.lead.createdAt, 0) - ms(b.lead.createdAt, 0));
    case "newest":
      return copy.sort((a, b) => ms(b.lead.createdAt, 0) - ms(a.lead.createdAt, 0));
    case "nextAction":
      // No next action is neither urgent nor distant — it is the absence of a
      // commitment, and it belongs at the end rather than at the top.
      return copy.sort(
        (a, b) =>
          ms(a.lead.nextActionAt, Number.MAX_SAFE_INTEGER) -
          ms(b.lead.nextActionAt, Number.MAX_SAFE_INTEGER),
      );
    case "highestValue":
      return copy.sort((a, b) => (b.entry.estimatedValue ?? 0) - (a.entry.estimatedValue ?? 0));
    case "stalest":
      return copy.sort(
        (a, b) => ms(a.entry.enteredStageAt, nowMs) - ms(b.entry.enteredStageAt, nowMs),
      );
    default:
      return copy;
  }
}
