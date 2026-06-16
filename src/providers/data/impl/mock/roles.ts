import { rolesApi } from "@/mocks";
import { auditLog } from "@/features/rbac";
import type { ID, IPermission } from "@/shared/types";
import type { ICreateRoleInput, IRolesProvider } from "../../contracts/roles";

/**
 * Mock implementation of {@link IRolesProvider} (PRD-211, Tasks 6/7).
 *
 * Thin adapter over `rolesApi` (mock store), adding the audit trail on every
 * mutation. Reads are pass-through.
 *
 * FOLLOW-UP (Tasks 15/16): `remove()` blocks on assigned users, but seller→role
 * assignment is not yet cabled — `rolesApi.remove` currently counts 0 (no
 * signal). Once the link exists, the count becomes meaningful.
 */
export const mockRolesProvider: IRolesProvider = {
  list: () => rolesApi.list(),
  get: (id) => rolesApi.get(id),
  listResources: () => rolesApi.listResources(),

  async create(input: ICreateRoleInput) {
    const created = await rolesApi.create(input);
    auditLog({
      action: "role.create",
      resource: "role",
      resourceId: created.id,
      storeId: created.storeId ?? undefined,
      after: created,
    });
    return created;
  },

  async updateMeta(id: ID, patch: { name?: string; description?: string }) {
    const before = await rolesApi.get(id);
    const updated = await rolesApi.updateMeta(id, patch);
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

  async setPermissions(id: ID, permissions: IPermission[]) {
    const before = await rolesApi.get(id);
    const updated = await rolesApi.setPermissions(id, permissions);
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

  async restoreDefaults(id: ID) {
    const before = await rolesApi.get(id);
    const updated = await rolesApi.restoreDefaults(id);
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

  async remove(id: ID) {
    const before = await rolesApi.get(id);
    await rolesApi.remove(id);
    auditLog({
      action: "role.delete",
      resource: "role",
      resourceId: id,
      storeId: before.storeId ?? undefined,
      before,
    });
  },
};
