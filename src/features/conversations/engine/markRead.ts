import type { IConversation, ID } from "@/shared/types";

/**
 * Clears the unread badge of one conversation inside a list, returning the SAME
 * array reference when there is nothing to change.
 *
 * The referential bailout is the point, not an optimisation. The previous
 * implementation was a bare `.map()`, which allocates a fresh array even when
 * no row matched. The Inbox's read-reset effect depends on the list, so a fresh
 * array re-runs it — harmless while its exit condition also lived in that list,
 * because the zeroed count made the next run return early.
 *
 * That stopped being true on 2026-08-11, when the pinned-conversations block
 * added a second source (`InboxPage`: `rawItems.find(...) ?? pins.pinnedItems.find(...)`).
 * For a conversation that is PINNED, still unread, and outside the paginated
 * window, the exit condition then lived in the pins query — which this function
 * never touched — while the `.map()` kept minting new arrays. The effect looped,
 * firing a `markRead()` request every turn against an endpoint averaging 77 ms,
 * and the tab froze for seconds at a time.
 *
 * Returning `prev` unchanged is also what React itself expects: an identical
 * reference lets `setState` bail out instead of scheduling another render.
 */
export function markConversationReadInList(
  list: readonly IConversation[],
  id: ID,
): IConversation[] {
  const index = list.findIndex((c) => c.id === id && c.unreadCount > 0);
  if (index === -1) return list as IConversation[];
  const next = list.slice();
  next[index] = { ...next[index]!, unreadCount: 0 };
  return next;
}
