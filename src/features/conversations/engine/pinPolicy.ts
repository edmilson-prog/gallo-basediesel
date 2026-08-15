import type { IConversation } from "@/shared/types";
import { DEFAULT_INBOX_PINS_SETTINGS, MAX_PINNED, MIN_PINNED } from "../config/pinDefaults";

/**
 * Pure rules for pinned conversations (spec 2026-08-11). No React and no
 * network — everything that needs testing lives here.
 */

/**
 * Sanitize the cap read from `stores.settings->'inboxPins'->'maxPinned'`: a
 * hand-edited jsonb can hold anything, and an invalid cap must neither break
 * the screen nor unlock unlimited pinning.
 */
export function resolveMaxPinned(raw: number | undefined): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return DEFAULT_INBOX_PINS_SETTINGS.maxPinned;
  }
  const floored = Math.floor(raw);
  if (floored < MIN_PINNED) return MIN_PINNED;
  if (floored > MAX_PINNED) return MAX_PINNED;
  return floored;
}

/**
 * Room for one more? False AT or ABOVE the cap — the Owner may lower the cap
 * after someone already pinned more than it allows, and the right move there is
 * to block new pins, never to unpin on the user's behalf.
 */
export function canPinMore(pinnedCount: number, maxPinned: number): boolean {
  return pinnedCount < maxPinned;
}

/**
 * Does the pinned block render? It disappears during any search (decision D-3):
 * search is global by owner decision and ignores every filter, so a fixed block
 * above the results would only compete with what was searched for.
 */
export function shouldShowPinnedBlock(ctx: {
  searchActive: boolean;
  messageSearchActive: boolean;
  pinnedCount: number;
}): boolean {
  if (ctx.pinnedCount === 0) return false;
  return !ctx.searchActive && !ctx.messageSearchActive;
}

/**
 * Single display list: pinned rows first, then the normal list WITHOUT the ids
 * already pinned.
 *
 * One list (instead of two parallel ones) is what keeps arrow-key navigation,
 * "clear the unread badge on open", "reopen the last conversation" and the
 * no-duplicate-row guarantee correct for free — they all scan `items` by id.
 */
export function mergePinnedFirst(
  pinned: IConversation[],
  list: IConversation[],
): { items: IConversation[]; pinnedCount: number } {
  if (pinned.length === 0) return { items: list, pinnedCount: 0 };
  const pinnedIds = new Set(pinned.map((c) => c.id));
  const rest = list.filter((c) => !pinnedIds.has(c.id));
  return { items: [...pinned, ...rest], pinnedCount: pinned.length };
}
