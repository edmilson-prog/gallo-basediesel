import type { ID, IConversation, IConversationActivityEvent } from "@/shared/types";
import { deriveActivityDelta } from "@/providers/data/engine/conversationActivity";
import { readCurrentUserSync } from "@/features/auth/guards";
import { selectConversationById } from "../store/selectors";
import { conversationActivityApi } from "./conversationActivity";

/** Terminal statuses — a remove here is the close-clear, not a manual leave. */
const TERMINAL_STATUSES = new Set(["resolvida", "arquivada"]);

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

/**
 * Record a collaborator join/leave in the mock attendance history, mirroring the
 * SQL trigger `conversation_participant_activity_capture`: the collaborator goes
 * in `toSellerId`, the actor (current mock seller, or `system`) in `actorId`,
 * with no status/owner delta. A remove on an already-terminal conversation is
 * the close-clear (`clearConversationParticipantsSync` never calls this anyway)
 * and is skipped, same as the trigger's guard.
 */
export function emitParticipantActivity(
  conversationId: ID,
  participantSellerId: ID,
  kind: "add" | "remove",
): void {
  const conversation = selectConversationById(conversationId);
  if (!conversation) return;
  if (kind === "remove" && TERMINAL_STATUSES.has(conversation.status)) return;
  const actorId = getCurrentMockSellerId();
  const event: IConversationActivityEvent = {
    id: crypto.randomUUID(),
    conversationId: conversation.id,
    customerId: conversation.customerId,
    leadId: conversation.leadId,
    storeId: conversation.storeId,
    type: kind === "add" ? "participant_add" : "participant_remove",
    fromStatus: null,
    toStatus: null,
    fromSellerId: null,
    toSellerId: participantSellerId,
    actorId,
    actorKind: actorId === null ? "system" : "seller",
    createdAt: new Date().toISOString(),
    conversationChannel: conversation.channel,
    conversationStatus: conversation.status,
    conversationCreatedAt: conversation.createdAt,
  };
  void conversationActivityApi.create(event);
}
