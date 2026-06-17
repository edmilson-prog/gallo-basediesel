import type {
  ID,
  IRotationParticipant,
  IRotationQueue,
  IRotationQueueState,
  RotationTargetMode,
} from "@/shared/types";
import { selectAllRotationParticipants, selectAllRotationQueues } from "../store/selectors";
import { useMockStore } from "../store/mockStore";
import { runApi } from "./utils";

/**
 * Mock API for the rotation queue (PRD-213). The store is the source of truth;
 * `ensureQueue` lazily creates the store's queue if the seed didn't already.
 */
function ensureQueue(storeId: ID): IRotationQueue {
  const existing = selectAllRotationQueues().find((q) => q.storeId === storeId);
  if (existing) return existing;
  const iso = new Date().toISOString();
  const created: IRotationQueue = {
    id: `rotq-${storeId}`,
    storeId,
    targetMode: "direct",
    lastAssignedRefId: null,
    skipOffline: true,
    createdAt: iso,
    updatedAt: iso,
  };
  useMockStore.setState((state) => ({ rotationQueues: [...state.rotationQueues, created] }));
  return created;
}

export const rotationQueuesApi = {
  getByStore(storeId: ID): Promise<IRotationQueue> {
    return runApi("rotationQueuesApi", "getByStore", () => ensureQueue(storeId), {
      payload: { storeId },
    });
  },

  getState(storeId: ID): Promise<IRotationQueueState> {
    return runApi(
      "rotationQueuesApi",
      "getState",
      () => {
        const queue = ensureQueue(storeId);
        const all = selectAllRotationParticipants().filter((p) => p.queueId === queue.id);
        const topParticipants = all
          .filter((p) => !p.scopeDepartmentId)
          .sort((a, b) => a.order - b.order);
        const membersByDepartment: Record<ID, IRotationParticipant[]> = {};
        for (const p of all) {
          if (!p.scopeDepartmentId) continue;
          (membersByDepartment[p.scopeDepartmentId] ??= []).push(p);
        }
        for (const list of Object.values(membersByDepartment)) {
          list.sort((a, b) => a.order - b.order);
        }
        return { queue, topParticipants, membersByDepartment };
      },
      { payload: { storeId } },
    );
  },

  update(
    storeId: ID,
    patch: { targetMode?: RotationTargetMode; lastAssignedRefId?: ID | null; skipOffline?: boolean },
  ): Promise<IRotationQueue> {
    return runApi(
      "rotationQueuesApi",
      "update",
      () => {
        const queue = ensureQueue(storeId);
        const updated: IRotationQueue = {
          ...queue,
          ...(patch.targetMode !== undefined ? { targetMode: patch.targetMode } : {}),
          ...(patch.lastAssignedRefId !== undefined
            ? { lastAssignedRefId: patch.lastAssignedRefId }
            : {}),
          ...(patch.skipOffline !== undefined ? { skipOffline: patch.skipOffline } : {}),
          updatedAt: new Date().toISOString(),
        };
        useMockStore.setState((state) => ({
          rotationQueues: state.rotationQueues.map((q) => (q.id === updated.id ? updated : q)),
        }));
        return updated;
      },
      { payload: { storeId, patch } },
    );
  },
};
