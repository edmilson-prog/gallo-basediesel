import type { ID, IRotationParticipant } from "@/shared/types";

export interface IAddRotationParticipantInput {
  queueId: ID;
  /** null = top-level participant; set = internal member of that department. */
  scopeDepartmentId?: ID | null;
  refType: "seller" | "department";
  refId: ID;
  enabled?: boolean;
}

export interface IRotationParticipantsProvider {
  /** Top-level participants of a queue (scopeDepartmentId null), ordered. */
  listTop(queueId: ID): Promise<IRotationParticipant[]>;
  /** Internal members of one department, ordered. */
  listByDepartment(queueId: ID, departmentId: ID): Promise<IRotationParticipant[]>;
  add(input: IAddRotationParticipantInput): Promise<IRotationParticipant>;
  remove(id: ID): Promise<void>;
  setEnabled(id: ID, enabled: boolean): Promise<IRotationParticipant>;
  /** Persists order = index for each id, in array order. */
  reorder(ids: ID[]): Promise<void>;
  /** Advances a department's internal pointer (refType='department' row). */
  setMemberPointer(queueId: ID, departmentId: ID, memberRefId: ID | null): Promise<void>;
}
