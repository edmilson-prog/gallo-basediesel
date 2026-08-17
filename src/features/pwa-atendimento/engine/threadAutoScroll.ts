import type { ID } from "@/shared/types";

/** Outcome of one thread render: whether to stick and the id to carry forward. */
export interface IThreadStickDecision {
  /** Scroll the thread to the bottom on this render. */
  stick: boolean;
  /** Last-message id the caller must feed back on the next render. */
  lastId: ID | null;
}

/**
 * Decide whether the thread scroller sticks to the bottom, given the last
 * message id seen on the previous render (`null` before the first load), the
 * current last id (`null` while the thread is empty) and whether the user is
 * pinned at the bottom.
 *
 * Tracking the LAST id — not the row count — distinguishes the two ways the
 * thread grows: older pages grow it at the top and never change the last id;
 * fresh messages grow it at the end and always do. The first load (previous id
 * `null`) sticks unconditionally so opening a conversation lands on the newest
 * message; afterwards a new message only pulls the user down when they were
 * already at the bottom. Same semantics as the desktop MessageList.
 */
export function resolveThreadStick(
  previousLastId: ID | null,
  currentLastId: ID | null,
  isAtBottom: boolean,
): IThreadStickDecision {
  if (currentLastId === null || currentLastId === previousLastId) {
    return { stick: false, lastId: previousLastId };
  }
  return { stick: previousLastId === null || isAtBottom, lastId: currentLastId };
}
