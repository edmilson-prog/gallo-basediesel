import type { ID, IRotationParticipant } from "@/shared/types";
import type {
  IAddRotationParticipantInput,
  IRotationParticipantsProvider,
} from "../../contracts/rotationParticipants";
import { getSupabaseClient } from "@/shared/lib/supabase";

/**
 * Supabase implementation of {@link IRotationParticipantsProvider} (PRD-213).
 * Writes are STAFF-only at the RLS layer. Reorder is per-row (small lists);
 * a SECURITY DEFINER RPC could make it atomic later if contention appears.
 */

interface PartRow {
  id: string;
  queue_id: string;
  scope_department_id: string | null;
  ref_type: "seller" | "department";
  ref_id: string;
  order: number;
  enabled: boolean;
  last_assigned_member_id: string | null;
}

const P_COLUMNS =
  'id, queue_id, scope_department_id, ref_type, ref_id, "order", enabled, last_assigned_member_id';

function rowToParticipant(r: PartRow): IRotationParticipant {
  return {
    id: r.id,
    queueId: r.queue_id,
    scopeDepartmentId: r.scope_department_id,
    refType: r.ref_type,
    refId: r.ref_id,
    order: r.order,
    enabled: r.enabled,
    lastAssignedMemberId: r.last_assigned_member_id,
  };
}

async function listScoped(queueId: ID, departmentId: ID | null): Promise<IRotationParticipant[]> {
  let query = getSupabaseClient()
    .from("rotation_participants")
    .select(P_COLUMNS)
    .eq("queue_id", queueId);
  query =
    departmentId === null
      ? query.is("scope_department_id", null)
      : query.eq("scope_department_id", departmentId);
  const { data, error } = await query.order("order", { ascending: true });
  if (error) throw new Error(`[supabase] rotationParticipants.list failed: ${error.message}`);
  return (data as PartRow[]).map(rowToParticipant);
}

export const supabaseRotationParticipantsProvider: IRotationParticipantsProvider = {
  listTop: (queueId) => listScoped(queueId, null),
  listByDepartment: (queueId, departmentId) => listScoped(queueId, departmentId),

  async add(input: IAddRotationParticipantInput) {
    const scope = input.scopeDepartmentId ?? null;
    const siblings = await listScoped(input.queueId, scope);
    const { data, error } = await getSupabaseClient()
      .from("rotation_participants")
      .insert({
        queue_id: input.queueId,
        scope_department_id: scope,
        ref_type: input.refType,
        ref_id: input.refId,
        order: siblings.length,
        enabled: input.enabled ?? true,
      })
      .select(P_COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] rotationParticipants.add failed: ${error.message}`);
    return rowToParticipant(data as PartRow);
  },

  async remove(id: ID) {
    const { error } = await getSupabaseClient()
      .from("rotation_participants")
      .delete()
      .eq("id", id);
    if (error) throw new Error(`[supabase] rotationParticipants.remove failed: ${error.message}`);
  },

  async setEnabled(id: ID, enabled: boolean) {
    const { data, error } = await getSupabaseClient()
      .from("rotation_participants")
      .update({ enabled })
      .eq("id", id)
      .select(P_COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] rotationParticipants.setEnabled failed: ${error.message}`);
    return rowToParticipant(data as PartRow);
  },

  async reorder(ids: ID[]) {
    const client = getSupabaseClient();
    // Per-row order updates; small lists. (Follow-up: a SECURITY DEFINER RPC for atomicity.)
    for (let index = 0; index < ids.length; index += 1) {
      const id = ids[index];
      if (!id) continue;
      const { error } = await client
        .from("rotation_participants")
        .update({ order: index })
        .eq("id", id);
      if (error) throw new Error(`[supabase] rotationParticipants.reorder failed: ${error.message}`);
    }
  },

  async setMemberPointer(queueId: ID, departmentId: ID, memberRefId: ID | null) {
    const { error } = await getSupabaseClient()
      .from("rotation_participants")
      .update({ last_assigned_member_id: memberRefId })
      .eq("queue_id", queueId)
      .eq("ref_type", "department")
      .eq("ref_id", departmentId);
    if (error)
      throw new Error(`[supabase] rotationParticipants.setMemberPointer failed: ${error.message}`);
  },
};
