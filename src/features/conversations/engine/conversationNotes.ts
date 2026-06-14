/**
 * Pure display/permission helpers for conversation notes.
 *
 * Permissions here are UX discipline only — the real boundary is the RLS on
 * `conversation_notes` (author can edit own; author OR staff can delete/pin).
 */
import type { IConversationNote, ID, ISeller } from "@/shared/types";

/** Newest-first by createdAt (ISO strings sort lexicographically). */
function byNewest(a: IConversationNote, b: IConversationNote): number {
  return b.createdAt.localeCompare(a.createdAt);
}

/**
 * Splits notes into the pinned band (shown at the top of the panel) and the
 * chronological body, each ordered newest-first. Does not mutate the input.
 */
export function partitionNotes(notes: IConversationNote[]): {
  pinned: IConversationNote[];
  unpinned: IConversationNote[];
} {
  const pinned = notes.filter((n) => n.pinned).sort(byNewest);
  const unpinned = notes.filter((n) => !n.pinned).sort(byNewest);
  return { pinned, unpinned };
}

/** Editing the body is author-only. */
export function canEditNote(note: IConversationNote, currentSellerId: ID | undefined): boolean {
  return Boolean(currentSellerId) && note.authorId === currentSellerId;
}

/** Deleting and pinning are allowed for the author OR staff (Owner/Gestor). */
export function canManageNote(
  note: IConversationNote,
  currentSellerId: ID | undefined,
  isStaff: boolean,
): boolean {
  if (isStaff) return true;
  return Boolean(currentSellerId) && note.authorId === currentSellerId;
}

/** Display label / mention handle for a seller: attendantName || fullName. */
export function sellerDisplay(seller: Pick<ISeller, "attendantName" | "fullName">): string {
  return seller.attendantName?.trim() || seller.fullName;
}
