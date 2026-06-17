import type { ID, IRotationQueue, IRotationQueueState, RotationTargetMode } from "@/shared/types";

export interface IRotationQueuesProvider {
  /** Returns the store's queue, creating an empty one if it does not exist. */
  getByStore(storeId: ID): Promise<IRotationQueue>;
  /** Returns queue + top participants + members-by-department (aggregate read). */
  getState(storeId: ID): Promise<IRotationQueueState>;
  /** Patches queue config (targetMode / pointer / skipOffline). Audited. */
  update(
    storeId: ID,
    patch: { targetMode?: RotationTargetMode; lastAssignedRefId?: ID | null; skipOffline?: boolean },
  ): Promise<IRotationQueue>;
}
