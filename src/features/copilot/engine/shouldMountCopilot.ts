import type { ICopilotAssistantSettings, IConversation, RoleName } from "@/shared/types";

/**
 * The conversation fields the mount decision depends on.
 *
 * Widened over `Pick<IConversation, ...>` to also accept `null` (not just
 * `undefined`) for the optional fields — callers that read from a normalized
 * record (e.g. a DB row) commonly represent "absent" as `null`.
 */
export type ICopilotMountConversation = {
  [K in "customerId" | "leadId" | "whatsappAccountId"]: IConversation[K] | null;
};

export interface IShouldMountCopilotInput {
  settings: ICopilotAssistantSettings;
  conversation: ICopilotMountConversation;
  role: RoleName;
}

/**
 * Single source of truth for whether the copilot panel exists on a conversation.
 *
 * The page uses it BOTH to render and to decide whether to fetch panel data —
 * before this existed the fetch ran unconditionally, loading conversation,
 * every message and the SDR escalation on ~2.900 conversations that rendered
 * nothing.
 *
 * Pure: no I/O, no clock, no provider access.
 */
export function shouldMountCopilot({
  settings,
  conversation,
  role,
}: IShouldMountCopilotInput): boolean {
  if (!settings.enabled) return false;
  if (!settings.roles.includes(role)) return false;

  // An empty account list means "every account" — never "no account".
  if (settings.accountIds.length > 0) {
    if (!conversation.whatsappAccountId) return false;
    if (!settings.accountIds.includes(conversation.whatsappAccountId)) return false;
  }

  const hasCustomer = Boolean(conversation.customerId);
  const hasLead = Boolean(conversation.leadId);
  if (!hasCustomer && !hasLead) return false;

  if (settings.reach === "customer_only") return hasCustomer;
  if (settings.reach === "lead_only") return hasLead && !hasCustomer;
  return true;
}
