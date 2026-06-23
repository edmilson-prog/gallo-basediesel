import type { IConversation } from "@/shared/types";

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
