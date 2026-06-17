import type { ID, IRotationParticipant, IRotationQueue, ISeller } from "@/shared/types";

/**
 * Deterministic seed for the rotation queue (PRD-213). One queue per store in
 * `direct` mode; the store's active sellers become ordered, enabled participants.
 * IDs are stable (no random) so two bootstrap(seed) calls match.
 */
export function buildRotationSeed(
  storeId: ID,
  sellers: ISeller[],
  now: Date,
): { queues: IRotationQueue[]; participants: IRotationParticipant[] } {
  const iso = now.toISOString();
  const queueId = `rotq-${storeId}`;
  const queue: IRotationQueue = {
    id: queueId,
    storeId,
    targetMode: "direct",
    lastAssignedRefId: null,
    skipOffline: true,
    createdAt: iso,
    updatedAt: iso,
  };
  const participants: IRotationParticipant[] = sellers
    .filter((s) => s.storeId === storeId && s.active && s.type !== "representative")
    .map((s, index) => ({
      id: `rotp-${s.id}`,
      queueId,
      scopeDepartmentId: null,
      refType: "seller" as const,
      refId: s.id,
      order: index,
      enabled: s.rotation?.enabled ?? true,
    }));
  return { queues: [queue], participants };
}
