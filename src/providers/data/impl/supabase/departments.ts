import type { ID, IDepartment } from "@/shared/types";
import { getSupabaseClient } from "@/shared/lib/supabase";
import { auditLog } from "@/features/rbac";
import type { ICreateDepartmentInput, IDepartmentsProvider } from "../../contracts/departments";

/**
 * Supabase implementation of {@link IDepartmentsProvider} (PRD-211, Tasks 6/7).
 *
 * The `departments` table has NO membership column — `sellerIds` is DERIVED
 * from the seller side: `select id from sellers where department_id = <dept>
 * and deleted_at is null`. Writes that pass `sellerIds` therefore update
 * `sellers.department_id` (set on the included sellers; cleared on the ones
 * dropped from the set).
 *
 * ⚠️ NON-ATOMICITY: create/update touch two tables (`departments` +
 * `sellers`) without a transaction. A failure between the steps leaves the
 * membership partially reconciled. A SECURITY DEFINER RPC would make it atomic
 * — left as a follow-up.
 */

const TABLE = "departments";
const SELLERS_TABLE = "sellers";
const COLUMNS = "id, name, store_id, manager_id, created_at";

interface DepartmentRow {
  id: string;
  name: string;
  store_id: string;
  manager_id: string | null;
  created_at: string;
}

function rowToDepartment(row: DepartmentRow, sellerIds: ID[]): IDepartment {
  return {
    id: row.id,
    name: row.name,
    storeId: row.store_id,
    managerId: row.manager_id ?? "",
    sellerIds,
    createdAt: row.created_at,
  };
}

/** Derives `department_id → sellerIds[]` for the given department ids. */
async function membershipFor(departmentIds: ID[]): Promise<Map<string, ID[]>> {
  const byDept = new Map<string, ID[]>();
  if (departmentIds.length === 0) return byDept;
  const { data, error } = await getSupabaseClient()
    .from(SELLERS_TABLE)
    .select("id, department_id")
    .in("department_id", departmentIds)
    .is("deleted_at", null);
  if (error) throw new Error(`[supabase] departments membership failed: ${error.message}`);
  for (const row of (data ?? []) as Array<{ id: string; department_id: string | null }>) {
    if (!row.department_id) continue;
    const list = byDept.get(row.department_id) ?? [];
    list.push(row.id);
    byDept.set(row.department_id, list);
  }
  return byDept;
}

/** Sets `department_id` on the given sellers (membership assignment). */
async function assignSellers(departmentId: ID, sellerIds: ID[]): Promise<void> {
  if (sellerIds.length === 0) return;
  const { error } = await getSupabaseClient()
    .from(SELLERS_TABLE)
    .update({ department_id: departmentId })
    .in("id", sellerIds);
  if (error) throw new Error(`[supabase] departments assign members failed: ${error.message}`);
}

/** Clears `department_id` on members of the department that are no longer listed. */
async function dropRemovedSellers(departmentId: ID, keepSellerIds: ID[]): Promise<void> {
  let query = getSupabaseClient()
    .from(SELLERS_TABLE)
    .update({ department_id: null })
    .eq("department_id", departmentId);
  if (keepSellerIds.length > 0) {
    // PostgREST list filter: keep the explicitly-listed sellers.
    query = query.not("id", "in", `(${keepSellerIds.join(",")})`);
  }
  const { error } = await query;
  if (error) throw new Error(`[supabase] departments drop members failed: ${error.message}`);
}

export const supabaseDepartmentsProvider: IDepartmentsProvider = {
  async list(params?: { storeId?: ID }): Promise<IDepartment[]> {
    let query = getSupabaseClient().from(TABLE).select(COLUMNS).order("name");
    if (params?.storeId) query = query.eq("store_id", params.storeId);
    const { data, error } = await query;
    if (error) throw new Error(`[supabase] departments.list failed: ${error.message}`);

    const rows = (data ?? []) as DepartmentRow[];
    const byDept = await membershipFor(rows.map((r) => r.id));
    return rows.map((r) => rowToDepartment(r, byDept.get(r.id) ?? []));
  },

  async get(id: ID): Promise<IDepartment> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .select(COLUMNS)
      .eq("id", id)
      .single();
    if (error) throw new Error(`[supabase] departments.get(${id}) failed: ${error.message}`);
    const byDept = await membershipFor([id]);
    return rowToDepartment(data as DepartmentRow, byDept.get(id) ?? []);
  },

  async create(input: ICreateDepartmentInput): Promise<IDepartment> {
    const id = `dept-${crypto.randomUUID()}`;
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .insert({
        id,
        name: input.name.trim(),
        store_id: input.storeId,
        manager_id: input.managerId ?? null,
      })
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] departments.create failed: ${error.message}`);

    const sellerIds = input.sellerIds ?? [];
    await assignSellers(id, sellerIds);

    const created = rowToDepartment(data as DepartmentRow, [...sellerIds]);
    auditLog({
      action: "department.create",
      resource: "department",
      resourceId: created.id,
      storeId: created.storeId,
      after: created,
    });
    return created;
  },

  async update(
    id: ID,
    patch: Partial<Omit<IDepartment, "id" | "createdAt">>,
  ): Promise<IDepartment> {
    const before = await this.get(id);
    const row: Record<string, unknown> = {};
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.storeId !== undefined) row.store_id = patch.storeId;
    if (patch.managerId !== undefined) row.manager_id = patch.managerId || null;
    if (Object.keys(row).length > 0) {
      const { error } = await getSupabaseClient().from(TABLE).update(row).eq("id", id);
      if (error) throw new Error(`[supabase] departments.update(${id}) failed: ${error.message}`);
    }

    // Reconcile membership on the seller side when the caller passed sellerIds.
    if (patch.sellerIds !== undefined) {
      await assignSellers(id, patch.sellerIds);
      await dropRemovedSellers(id, patch.sellerIds);
    }

    const updated = await this.get(id);
    auditLog({
      action: "department.update",
      resource: "department",
      resourceId: id,
      storeId: updated.storeId,
      before,
      after: updated,
    });
    return updated;
  },

  async remove(id: ID): Promise<void> {
    const before = await this.get(id);
    // Detach members first so no seller dangles onto a deleted department.
    await dropRemovedSellers(id, []);
    const { error } = await getSupabaseClient().from(TABLE).delete().eq("id", id);
    if (error) throw new Error(`[supabase] departments.remove(${id}) failed: ${error.message}`);
    auditLog({
      action: "department.delete",
      resource: "department",
      resourceId: id,
      storeId: before.storeId,
      before,
    });
  },
};
