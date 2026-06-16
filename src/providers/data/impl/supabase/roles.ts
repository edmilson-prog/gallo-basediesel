import type {
  ID,
  IPermission,
  IRbacResource,
  IRole,
  PermissionAction,
  PermissionScope,
  RoleName,
} from "@/shared/types";
import { getSupabaseClient } from "@/shared/lib/supabase";
import { buildRoleSeed } from "@/features/rbac/permissions/seed";
import { auditLog } from "@/features/rbac";
import type { ICreateRoleInput, IRolesProvider } from "../../contracts/roles";

/**
 * Supabase implementation of {@link IRolesProvider} (PRD-211, Tasks 6/7).
 *
 * `roles` (one row per role) + `role_permissions` (one row per resource grant)
 * are stitched into `IRole` with an aggregated `permissions[]`. RLS scopes who
 * can read/write; this provider stays a thin mapper.
 *
 * ⚠️ NON-ATOMICITY: `setPermissions`/`restoreDefaults`/`create` perform a
 * delete-then-insert (or insert-then-insert) across two statements. There is no
 * client-side transaction in supabase-js, so a failure between the two leaves a
 * partial permission set. A SECURITY DEFINER RPC would make this atomic — left
 * as a follow-up; the screens (Task 11) gate writes to Owner so the blast
 * radius is contained.
 *
 * FOLLOW-UP (Tasks 15/16): `remove()` blocks on assigned users, but the
 * seller→role link does not exist yet (no `sellers.role_id`), so the usage
 * count is currently always 0. Mirror the mock note when wiring assignment.
 */

const ROLES_TABLE = "roles";
const PERMS_TABLE = "role_permissions";
const RESOURCES_TABLE = "rbac_resources";

const ROLE_COLUMNS =
  "id, slug, name, description, is_system, is_owner_immutable, base_role, store_id, created_at, updated_at";

interface RoleRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  is_system: boolean;
  is_owner_immutable: boolean;
  base_role: string;
  store_id: string | null;
  created_at: string;
  updated_at: string;
}

interface PermissionRow {
  role_id: string;
  resource: string;
  actions: string[];
  scope: string;
}

interface ResourceRow {
  key: string;
  label: string;
  group: string;
  sort_order: number;
}

function permRowToPermission(row: PermissionRow): IPermission {
  return {
    resource: row.resource,
    actions: row.actions as PermissionAction[],
    scope: row.scope as PermissionScope,
  };
}

function roleRowToRole(row: RoleRow, permissions: IPermission[]): IRole {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description ?? undefined,
    isSystem: row.is_system,
    isOwnerImmutable: row.is_owner_immutable,
    baseRole: row.base_role as RoleName,
    storeId: row.store_id ?? null,
    permissions,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function resourceRowToResource(row: ResourceRow): IRbacResource {
  return { key: row.key, label: row.label, group: row.group, sortOrder: row.sort_order };
}

/** Maps domain permissions to `role_permissions` insert rows for one role. */
function permissionsToRows(roleId: ID, permissions: IPermission[]): PermissionRow[] {
  return permissions.map((p) => ({
    role_id: roleId,
    resource: p.resource,
    actions: p.actions,
    scope: p.scope,
  }));
}

export const supabaseRolesProvider: IRolesProvider = {
  async list(): Promise<IRole[]> {
    const client = getSupabaseClient();
    const [rolesRes, permsRes] = await Promise.all([
      client.from(ROLES_TABLE).select(ROLE_COLUMNS).order("name"),
      client.from(PERMS_TABLE).select("role_id, resource, actions, scope"),
    ]);
    if (rolesRes.error) throw new Error(`[supabase] roles.list failed: ${rolesRes.error.message}`);
    if (permsRes.error)
      throw new Error(`[supabase] roles.list (permissions) failed: ${permsRes.error.message}`);

    const byRole = new Map<string, IPermission[]>();
    for (const row of (permsRes.data ?? []) as PermissionRow[]) {
      const list = byRole.get(row.role_id) ?? [];
      list.push(permRowToPermission(row));
      byRole.set(row.role_id, list);
    }
    return (rolesRes.data as RoleRow[]).map((r) => roleRowToRole(r, byRole.get(r.id) ?? []));
  },

  async get(id: ID): Promise<IRole> {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from(ROLES_TABLE)
      .select(ROLE_COLUMNS)
      .eq("id", id)
      .single();
    if (error) throw new Error(`[supabase] roles.get(${id}) failed: ${error.message}`);

    const { data: perms, error: permErr } = await client
      .from(PERMS_TABLE)
      .select("role_id, resource, actions, scope")
      .eq("role_id", id);
    if (permErr)
      throw new Error(`[supabase] roles.get(${id}) permissions failed: ${permErr.message}`);

    const permissions = ((perms ?? []) as PermissionRow[]).map(permRowToPermission);
    return roleRowToRole(data as RoleRow, permissions);
  },

  async listResources(): Promise<IRbacResource[]> {
    const { data, error } = await getSupabaseClient()
      .from(RESOURCES_TABLE)
      .select('key, label, "group", sort_order')
      .order("sort_order", { ascending: true });
    if (error) throw new Error(`[supabase] roles.listResources failed: ${error.message}`);
    return (data as ResourceRow[]).map(resourceRowToResource);
  },

  async create(input: ICreateRoleInput): Promise<IRole> {
    const client = getSupabaseClient();
    // Custom role id/slug must NOT collide with a system slug — generate one.
    const id = `role-${crypto.randomUUID()}`;
    const { data, error } = await client
      .from(ROLES_TABLE)
      .insert({
        id,
        slug: id,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        is_system: false,
        is_owner_immutable: false,
        base_role: input.baseRole,
        store_id: input.storeId ?? null,
      })
      .select(ROLE_COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] roles.create failed: ${error.message}`);

    if (input.permissions.length > 0) {
      const { error: permErr } = await client
        .from(PERMS_TABLE)
        .insert(permissionsToRows(id, input.permissions));
      if (permErr)
        throw new Error(`[supabase] roles.create permissions failed: ${permErr.message}`);
    }

    const created = roleRowToRole(data as RoleRow, [...input.permissions]);
    auditLog({
      action: "role.create",
      resource: "role",
      resourceId: created.id,
      storeId: created.storeId ?? undefined,
      after: created,
    });
    return created;
  },

  async updateMeta(id: ID, patch: { name?: string; description?: string }): Promise<IRole> {
    const before = await this.get(id);
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.description !== undefined) row.description = patch.description;
    const { error } = await getSupabaseClient().from(ROLES_TABLE).update(row).eq("id", id);
    if (error) throw new Error(`[supabase] roles.updateMeta(${id}) failed: ${error.message}`);

    const updated = await this.get(id);
    auditLog({
      action: "role.update",
      resource: "role",
      resourceId: id,
      storeId: updated.storeId ?? undefined,
      before,
      after: updated,
    });
    return updated;
  },

  async setPermissions(id: ID, permissions: IPermission[]): Promise<IRole> {
    const before = await this.get(id);
    const client = getSupabaseClient();
    // NON-ATOMIC delete + insert (see file header). Touch updated_at too.
    const { error: delErr } = await client.from(PERMS_TABLE).delete().eq("role_id", id);
    if (delErr)
      throw new Error(`[supabase] roles.setPermissions(${id}) clear failed: ${delErr.message}`);
    if (permissions.length > 0) {
      const { error: insErr } = await client
        .from(PERMS_TABLE)
        .insert(permissionsToRows(id, permissions));
      if (insErr)
        throw new Error(`[supabase] roles.setPermissions(${id}) insert failed: ${insErr.message}`);
    }
    await client.from(ROLES_TABLE).update({ updated_at: new Date().toISOString() }).eq("id", id);

    const updated = await this.get(id);
    auditLog({
      action: "role.permissions.update",
      resource: "role",
      resourceId: id,
      storeId: updated.storeId ?? undefined,
      before: before.permissions,
      after: updated.permissions,
    });
    return updated;
  },

  async restoreDefaults(id: ID): Promise<IRole> {
    const before = await this.get(id);
    const seed = buildRoleSeed().find((s) => s.slug === before.slug);
    if (!seed) {
      throw new Error(
        `[supabase] roles.restoreDefaults(${id}): no factory default for slug "${before.slug}".`,
      );
    }
    const updated = await this.setPermissions(id, seed.permissions);
    // setPermissions already logs role.permissions.update; add a restore marker.
    auditLog({
      action: "role.restore_defaults",
      resource: "role",
      resourceId: id,
      storeId: updated.storeId ?? undefined,
      before: before.permissions,
      after: updated.permissions,
    });
    return updated;
  },

  async remove(id: ID): Promise<void> {
    const before = await this.get(id);
    // Usage check FOLLOW-UP (T15/T16): no seller→role link yet, so count is 0.
    const assignedCount = await countRoleUsage(id);
    if (assignedCount > 0) {
      throw new Error(`Não é possível excluir: ${assignedCount} usuário(s) ainda usam este papel.`);
    }
    // role_permissions cascade-deletes via FK (role_id → roles.id).
    const { error } = await getSupabaseClient().from(ROLES_TABLE).delete().eq("id", id);
    if (error) throw new Error(`[supabase] roles.remove(${id}) failed: ${error.message}`);
    auditLog({
      action: "role.delete",
      resource: "role",
      resourceId: id,
      storeId: before.storeId ?? undefined,
      before,
    });
  },
};

/**
 * Counts users assigned to a role.
 *
 * FOLLOW-UP (Tasks 15/16): the seller→role link is not cabled yet (no
 * `sellers.role_id` column), so there is no signal to query. Returns 0 — once
 * assignment lands, run `select count(*) from sellers where role_id = id and
 * deleted_at is null` here.
 */
async function countRoleUsage(_roleId: ID): Promise<number> {
  return 0;
}
