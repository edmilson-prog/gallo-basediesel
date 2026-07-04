import type { AttendanceActivityType, ConversationStatus, ID } from "@/shared/types";

export interface IActivityDelta {
  type: AttendanceActivityType;
  fromStatus: ConversationStatus | null;
  toStatus: ConversationStatus | null;
  fromSellerId: ID | null;
  toSellerId: ID | null;
}

interface ConvState {
  status: ConversationStatus;
  assignedSellerId: ID | null;
}

/**
 * Derive a single activity event from a conversation transition. Mirrors the SQL
 * trigger `conversation_activity_capture` (migration 20260703170000) — keep both
 * in sync. `actorId` null means the change came from the system (webhook /
 * service role). Returns null when nothing relevant (status or owner) changed.
 */
export function deriveActivityDelta(
  before: ConvState | null,
  after: ConvState,
  actorId: ID | null,
): IActivityDelta | null {
  if (before === null) {
    return {
      type: "created",
      fromStatus: null,
      toStatus: after.status,
      fromSellerId: null,
      toSellerId: after.assignedSellerId,
    };
  }

  const statusChanged = before.status !== after.status;
  const sellerChanged = (before.assignedSellerId ?? null) !== (after.assignedSellerId ?? null);
  if (!statusChanged && !sellerChanged) return null;

  const type: AttendanceActivityType =
    statusChanged &&
    after.status === "aguardando" &&
    (before.status === "resolvida" || before.status === "arquivada") &&
    actorId === null
      ? "reopen"
      : statusChanged
        ? "status"
        : "assignment";

  return {
    type,
    fromStatus: statusChanged ? before.status : null,
    toStatus: statusChanged ? after.status : null,
    fromSellerId: sellerChanged ? (before.assignedSellerId ?? null) : null,
    toSellerId: sellerChanged ? (after.assignedSellerId ?? null) : null,
  };
}
