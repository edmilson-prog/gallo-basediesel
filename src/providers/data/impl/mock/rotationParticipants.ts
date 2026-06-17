import { rotationParticipantsApi } from "@/mocks";
import type { ID } from "@/shared/types";
import type {
  IAddRotationParticipantInput,
  IRotationParticipantsProvider,
} from "../../contracts/rotationParticipants";

/**
 * Mock implementation of {@link IRotationParticipantsProvider} (PRD-213, Tasks 6/7).
 *
 * Thin adapter over `rotationParticipantsApi` (mock store). No audit trail
 * needed for participant mutations; the rotation queue manager UI handles
 * those as configuration side effects of the flow.
 */
export const mockRotationParticipantsProvider: IRotationParticipantsProvider = {
  listTop: (queueId) => rotationParticipantsApi.listTop(queueId),
  listByDepartment: (queueId, departmentId) =>
    rotationParticipantsApi.listByDepartment(queueId, departmentId),
  add: (input: IAddRotationParticipantInput) => rotationParticipantsApi.add(input),
  remove: (id: ID) => rotationParticipantsApi.remove(id),
  setEnabled: (id: ID, enabled: boolean) => rotationParticipantsApi.setEnabled(id, enabled),
  reorder: (ids: ID[]) => rotationParticipantsApi.reorder(ids),
  setMemberPointer: (queueId, departmentId, memberRefId) =>
    rotationParticipantsApi.setMemberPointer(queueId, departmentId, memberRefId),
};
