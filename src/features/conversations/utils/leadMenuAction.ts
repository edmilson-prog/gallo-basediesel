import type { IConversation } from "@/shared/types";

/**
 * Which lead-related action the conversation menu offers, if any.
 * `null` when the conversation is already a customer (no longer a lead
 * prospect) or the acting user lacks the relevant permission.
 */
export type LeadMenuAction = "qualify" | "view" | null;

export interface ILeadMenuPermissions {
  /** Whether the acting user can create a lead ("lead"/"create"). */
  canCreate: boolean;
  /** Whether the acting user can view leads ("lead"/"view"). */
  canView: boolean;
}

/**
 * Decides which lead action, if any, the conversation's "⋮" menu should
 * offer. Mirrors the domain invariant that exactly one of `customerId` /
 * `leadId` is set on a conversation (`src/shared/types/conversation.ts`).
 */
export function getLeadMenuAction(
  conversation: Pick<IConversation, "customerId" | "leadId">,
  permissions: ILeadMenuPermissions,
): LeadMenuAction {
  if (conversation.customerId) return null;
  if (conversation.leadId) return permissions.canView ? "view" : null;
  return permissions.canCreate ? "qualify" : null;
}
