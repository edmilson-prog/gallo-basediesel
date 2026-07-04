import type { ID, IConversation, IConversationActivityEvent } from "@/shared/types";
import { deriveActivityDelta } from "@/providers/data/engine/conversationActivity";
import { readCurrentUserSync } from "@/features/auth/guards";
import { conversationActivityApi } from "./conversationActivity";

/**
 * Resolve the acting seller for the mock layer, mirroring `logMockMutation`'s
 * source (`readCurrentUserSync`, the `AuthProvider`-hydrated localStorage
 * mirror). Returns null when there's no logged-in seller (⇒ actorKind
 * 'system') — the mock is demo-only, so this is best-effort.
 */
export function getCurrentMockSellerId(): ID | null {
  const user = readCurrentUserSync();
  return user?.sellerId ?? null;
}

/**
 * Derive and persist a conversation activity event for a mutation, mirroring
 * the SQL trigger `conversation_activity_capture` (Task 4) on the supabase
 * side. No-op when the transition carries no status/owner delta.
 */
export function emitConversationActivity(
  before: IConversation | null,
  after: IConversation,
  actorId: ID | null,
): void {
  const delta = deriveActivityDelta(
    before ? { status: before.status, assignedSellerId: before.assignedSellerId ?? null } : null,
    { status: after.status, assignedSellerId: after.assignedSellerId ?? null },
    actorId,
  );
  if (!delta) return;
  const event: IConversationActivityEvent = {
    id: crypto.randomUUID(),
    conversationId: after.id,
    customerId: after.customerId,
    leadId: after.leadId,
    storeId: after.storeId,
    type: delta.type,
    fromStatus: delta.fromStatus,
    toStatus: delta.toStatus,
    fromSellerId: delta.fromSellerId,
    toSellerId: delta.toSellerId,
    actorId,
    actorKind: actorId === null ? "system" : "seller",
    createdAt: new Date().toISOString(),
    conversationChannel: after.channel,
    conversationStatus: after.status,
    conversationCreatedAt: after.createdAt,
  };
  void conversationActivityApi.create(event);
}
