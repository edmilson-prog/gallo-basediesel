import { rotationQueuesApi } from "@/mocks";
import { auditLog } from "@/features/rbac";
import type { ID, RotationTargetMode } from "@/shared/types";
import type { IRotationQueuesProvider } from "../../contracts/rotationQueues";

/**
 * Mock implementation of {@link IRotationQueuesProvider} (PRD-213, Tasks 6/7).
 *
 * Thin adapter over `rotationQueuesApi` (mock store), adding the audit trail on
 * operator-facing config mutations (targetMode, skipOffline). Pointer advances
 * (lastAssignedRefId) are not audited, only state-changing config changes.
 */
export const mockRotationQueuesProvider: IRotationQueuesProvider = {
  getByStore: (storeId) => rotationQueuesApi.getByStore(storeId),
  getState: (storeId) => rotationQueuesApi.getState(storeId),
  async update(
    storeId: ID,
    patch: {
      targetMode?: RotationTargetMode;
      lastAssignedRefId?: ID | null;
      skipOffline?: boolean;
    },
  ) {
    const updated = await rotationQueuesApi.update(storeId, patch);
    // Only audit operator-facing config changes (not pointer advances).
    if (patch.targetMode !== undefined || patch.skipOffline !== undefined) {
      auditLog({
        action: "rotation.queue.update",
        resource: "rotation_queue",
        resourceId: updated.id,
        storeId: updated.storeId,
        after: { targetMode: updated.targetMode, skipOffline: updated.skipOffline },
      });
    }
    return updated;
  },
};
