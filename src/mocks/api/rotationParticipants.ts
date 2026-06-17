import type { ID, IRotationParticipant } from "@/shared/types";
import { selectAllRotationParticipants } from "../store/selectors";
import { useMockStore } from "../store/mockStore";
import { MockNotFoundError, runApi } from "./utils";

// Mirror of IAddRotationParticipantInput (contracts) — defined locally to keep
// the mock layer free of provider/contract imports (matches departmentsApi).
export interface IAddRotationParticipantInput {
  queueId: ID;
  scopeDepartmentId?: ID | null;
  refType: "seller" | "department";
  refId: ID;
  enabled?: boolean;
}

function scoped(queueId: ID, departmentId: ID | null): IRotationParticipant[] {
  return selectAllRotationParticipants()
    .filter((p) => p.queueId === queueId && (p.scopeDepartmentId ?? null) === departmentId)
    .sort((a, b) => a.order - b.order);
}

export const rotationParticipantsApi = {
  listTop(queueId: ID): Promise<IRotationParticipant[]> {
    return runApi("rotationParticipantsApi", "listTop", () => scoped(queueId, null), {
      payload: { queueId },
    });
  },

  listByDepartment(queueId: ID, departmentId: ID): Promise<IRotationParticipant[]> {
    return runApi(
      "rotationParticipantsApi",
      "listByDepartment",
      () => scoped(queueId, departmentId),
      { payload: { queueId, departmentId } },
    );
  },

  add(input: IAddRotationParticipantInput): Promise<IRotationParticipant> {
    return runApi(
      "rotationParticipantsApi",
      "add",
      () => {
        const scope = input.scopeDepartmentId ?? null;
        const siblings = scoped(input.queueId, scope);
        const created: IRotationParticipant = {
          id: `rotp-${crypto.randomUUID().slice(0, 8)}`,
          queueId: input.queueId,
          scopeDepartmentId: scope,
          refType: input.refType,
          refId: input.refId,
          order: siblings.length,
          enabled: input.enabled ?? true,
          lastAssignedMemberId: input.refType === "department" ? null : undefined,
        };
        useMockStore.setState((state) => ({
          rotationParticipants: [...state.rotationParticipants, created],
        }));
        return created;
      },
      { payload: input },
    );
  },

  remove(id: ID): Promise<void> {
    return runApi(
      "rotationParticipantsApi",
      "remove",
      () => {
        useMockStore.setState((state) => ({
          rotationParticipants: state.rotationParticipants.filter((p) => p.id !== id),
        }));
      },
      { payload: { id } },
    );
  },

  setEnabled(id: ID, enabled: boolean): Promise<IRotationParticipant> {
    return runApi(
      "rotationParticipantsApi",
      "setEnabled",
      () => {
        let updated: IRotationParticipant | null = null;
        useMockStore.setState((state) => ({
          rotationParticipants: state.rotationParticipants.map((p) => {
            if (p.id !== id) return p;
            updated = { ...p, enabled };
            return updated;
          }),
        }));
        if (!updated) throw new MockNotFoundError("rotation_participant", id);
        return updated;
      },
      { payload: { id, enabled } },
    );
  },

  reorder(ids: ID[]): Promise<void> {
    return runApi(
      "rotationParticipantsApi",
      "reorder",
      () => {
        const orderById = new Map(ids.map((id, index) => [id, index]));
        useMockStore.setState((state) => ({
          rotationParticipants: state.rotationParticipants.map((p) =>
            orderById.has(p.id) ? { ...p, order: orderById.get(p.id)! } : p,
          ),
        }));
      },
      { payload: { ids } },
    );
  },

  setMemberPointer(queueId: ID, departmentId: ID, memberRefId: ID | null): Promise<void> {
    return runApi(
      "rotationParticipantsApi",
      "setMemberPointer",
      () => {
        useMockStore.setState((state) => ({
          rotationParticipants: state.rotationParticipants.map((p) =>
            p.queueId === queueId && p.refType === "department" && p.refId === departmentId
              ? { ...p, lastAssignedMemberId: memberRefId }
              : p,
          ),
        }));
      },
      { payload: { queueId, departmentId, memberRefId } },
    );
  },
};
