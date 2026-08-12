import type { ID, IRotationParticipant, IRotationQueue, IRotationQueueState } from "@/shared/types";
import type { IRotationQueuesProvider } from "../../contracts/rotationQueues";
import { getSupabaseClient } from "@/shared/lib/supabase";

/**
 * Supabase implementation of {@link IRotationQueuesProvider} (PRD-213).
 *
 * snake_case rows ↔ camelCase via the mappers below. `ensureQueue` lazily
 * creates the store's queue (RLS: any authenticated member can read; staff can
 * write the insert). Pointer advances go through `update` from the integration
 * point in `conversations.create`.
 */

interface QueueRow {
  id: string;
  store_id: string;
  target_mode: IRotationQueue["targetMode"];
  last_assigned_ref_id: string | null;
  skip_offline: boolean;
  created_at: string;
  updated_at: string;
}

const Q_COLUMNS =
  "id, store_id, target_mode, last_assigned_ref_id, skip_offline, created_at, updated_at";

function rowToQueue(r: QueueRow): IRotationQueue {
  return {
    id: r.id,
    storeId: r.store_id,
    targetMode: r.target_mode,
    lastAssignedRefId: r.last_assigned_ref_id,
    skipOffline: r.skip_offline,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

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

async function ensureQueue(storeId: ID): Promise<IRotationQueue> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("rotation_queues")
    .select(Q_COLUMNS)
    .eq("store_id", storeId)
    .maybeSingle();
  if (error) throw new Error(`[supabase] rotationQueues.getByStore failed: ${error.message}`);
  if (data) return rowToQueue(data as QueueRow);
  const { data: created, error: insErr } = await client
    .from("rotation_queues")
    .insert({ store_id: storeId })
    .select(Q_COLUMNS)
    .single();
  if (insErr) {
    // A concurrent create may have won the unique(store_id) race — re-read (RNF-001).
    const { data: existing } = await client
      .from("rotation_queues")
      .select(Q_COLUMNS)
      .eq("store_id", storeId)
      .maybeSingle();
    if (existing) return rowToQueue(existing as QueueRow);
    throw new Error(`[supabase] rotationQueues.create failed: ${insErr.message}`);
  }
  return rowToQueue(created as QueueRow);
}

export const supabaseRotationQueuesProvider: IRotationQueuesProvider = {
  getByStore: (storeId) => ensureQueue(storeId),

  async getState(storeId: ID): Promise<IRotationQueueState> {
    const queue = await ensureQueue(storeId);
    const { data, error } = await getSupabaseClient()
      .from("rotation_participants")
      .select(P_COLUMNS)
      .eq("queue_id", queue.id)
      // PostgREST takes the bare column name in `order=` — no SQL quoting needed
      // here (unlike the quoted "order" in the select list).
      .order("order", { ascending: true });
    if (error) throw new Error(`[supabase] rotationQueues.getState failed: ${error.message}`);
    const all = (data as PartRow[]).map(rowToParticipant);
    const topParticipants = all.filter((p) => !p.scopeDepartmentId);
    const membersByDepartment: Record<ID, IRotationParticipant[]> = {};
    for (const p of all) {
      if (!p.scopeDepartmentId) continue;
      (membersByDepartment[p.scopeDepartmentId] ??= []).push(p);
    }
    return { queue, topParticipants, membersByDepartment };
  },

  async update(storeId, patch) {
    const queue = await ensureQueue(storeId);
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.targetMode !== undefined) row.target_mode = patch.targetMode;
    if (patch.lastAssignedRefId !== undefined) row.last_assigned_ref_id = patch.lastAssignedRefId;
    if (patch.skipOffline !== undefined) row.skip_offline = patch.skipOffline;
    const { data, error } = await getSupabaseClient()
      .from("rotation_queues")
      .update(row)
      .eq("id", queue.id)
      .select(Q_COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] rotationQueues.update failed: ${error.message}`);
    return rowToQueue(data as QueueRow);
  },
};
