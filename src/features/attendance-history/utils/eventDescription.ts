import type { ID, ISeller, IConversationActivityEvent } from "@/shared/types";
import { CONVERSATION_STRINGS } from "@/features/conversations/i18n/pt-BR";
import { ATTENDANCE_HISTORY_STRINGS as S } from "../i18n/pt-BR";

/** Pure view-model helpers for a single timeline node — no I/O, no JSX. */

export function sellerName(id: ID | null | undefined, sellersById: Map<ID, ISeller>): string {
  if (!id) return S.unknownActor;
  return sellersById.get(id)?.fullName ?? S.unknownActor;
}

export function actorLabel(
  event: IConversationActivityEvent,
  sellersById: Map<ID, ISeller>,
): { label: string; isSystem: boolean } {
  if (event.actorKind === "system") return { label: S.system, isSystem: true };
  return { label: sellerName(event.actorId, sellersById), isSystem: false };
}

export function describeEvent(
  event: IConversationActivityEvent,
  sellersById: Map<ID, ISeller>,
): string {
  switch (event.type) {
    case "created":
      return S.eventCreated;
    case "status":
    case "reopen":
      return event.toStatus ? CONVERSATION_STRINGS.statusLabel[event.toStatus] : S.eventReopen;
    case "assignment":
      if (event.toSellerId && !event.fromSellerId) return S.assumedFromQueue;
      if (event.toSellerId && event.fromSellerId) {
        return S.transferredFrom(sellerName(event.fromSellerId, sellersById));
      }
      if (!event.toSellerId) return S.returnedToQueue;
      return S.eventAssignment;
    default:
      return "";
  }
}
