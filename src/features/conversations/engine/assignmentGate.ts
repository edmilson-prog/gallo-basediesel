import type { ID, IConversation } from "@/shared/types";

/**
 * Whether the current user must self-assign a pool conversation before they can
 * send a message to the customer. Reading is never gated.
 *
 * Gated when the conversation has no assignee AND the user is not staff. Staff
 * (Owner/Gestor — those who view store-wide conversations) are exempt. A
 * conversation already assigned (to the user, or to someone else where the user
 * is a co-responsible participant) is never gated, so the gate covers exactly
 * the pool.
 */
export function mustAssignToReply(
  conversation: Pick<IConversation, "assignedSellerId">,
  ctx: { isStaff: boolean },
): boolean {
  if (ctx.isStaff) return false;
  return conversation.assignedSellerId == null;
}

/**
 * Whether staff may return an assigned conversation to the pool/queue
 * (unassign). Offered only when the user is staff AND the conversation currently
 * has an assignee. A pool conversation has nothing to return. Mirrors the RLS:
 * only staff (`is_staff()`) can null the `assigned_seller_id` column. Inverse of
 * the read side covered by {@link mustAssignToReply}.
 */
export function canReturnToQueue(
  conversation: Pick<IConversation, "assignedSellerId">,
  ctx: { isStaff: boolean },
): boolean {
  if (!ctx.isStaff) return false;
  return conversation.assignedSellerId != null;
}

/**
 * Whether `sellerId` is the conversation's own assignee — the ownership half
 * of the "manage this conversation" gate (archive, transfer). Callers combine
 * this with a store-wide edit permission check for the staff exemption; this
 * function only ever answers the ownership question.
 */
export function isOwnConversation(
  conversation: Pick<IConversation, "assignedSellerId">,
  sellerId: ID | null | undefined,
): boolean {
  return sellerId != null && conversation.assignedSellerId === sellerId;
}

/**
 * Whether `sellerId` may invite/remove collaborators on this conversation —
 * mirrors the RLS `cp_insert` policy (staff, or the conversation's current
 * assignee): `supabase/migrations/20260704120000_conversation_participants_lifecycle.sql`.
 */
export function canManageCollaborators(
  conversation: Pick<IConversation, "assignedSellerId">,
  ctx: { isStaff: boolean; sellerId: ID | null | undefined },
): boolean {
  if (ctx.isStaff) return true;
  return isOwnConversation(conversation, ctx.sellerId);
}

/**
 * Whether `sellerId` may remove `collaboratorSellerId` from a conversation's
 * collaborator list — mirrors the RLS `cp_delete` policy: staff, the
 * conversation's assignee, OR the collaborator removing themselves.
 */
export function canRemoveCollaborator(
  conversation: Pick<IConversation, "assignedSellerId">,
  collaboratorSellerId: ID,
  ctx: { isStaff: boolean; sellerId: ID | null | undefined },
): boolean {
  if (ctx.isStaff) return true;
  if (ctx.sellerId != null && ctx.sellerId === collaboratorSellerId) return true;
  return isOwnConversation(conversation, ctx.sellerId);
}
