import type { ID, IPermission, IRbacResource, IRole, RoleName } from "@/shared/types";
import { buildRoleSeed } from "@/features/rbac/permissions/seed";
import { isAssignableBaseRole } from "@/features/rbac/utils/assignableRoles";
import { selectAllRbacResources, selectAllRoles } from "../store/selectors";
import { useMockStore } from "../store/mockStore";
import { MockNotFoundError, MockValidationError, runApi } from "./utils";

/**
 * Mock API surface for RBAC roles (PRD-211, Tasks 6/7).
 *
 * Roles/resources are populated by the bootstrap seed; reads use the existing
 * selectors and mutations patch the Zustand store in place (the typed
 * `mutations.ts` helpers do not yet cover the `roles` collection, so we mirror
 * the direct-`setState` style of `sellersApi.update`).
 */

export interface ICreateRoleInput {
  name: string;
  description?: string;
  baseRole: IRole["baseRole"];
  permissions: IPermission[];
  storeId?: ID | null;
}

const NOW = () => new Date().toISOString();

function clonePermissions(permissions: IPermission[]): IPermission[] {
  return permissions.map((p) => ({
    resource: p.resource,
    actions: [...p.actions],
    scope: p.scope,
  }));
}

export const rolesApi = {
  list(): Promise<IRole[]> {
    return runApi("rolesApi", "list", () => selectAllRoles().map((r) => ({ ...r })));
  },

  get(id: ID): Promise<IRole> {
    return runApi("rolesApi", "get", () => {
      const found = selectAllRoles().find((r) => r.id === id);
      if (!found) throw new MockNotFoundError("role", id);
      return { ...found };
    });
  },

  /** @deprecated kept for legacy lookups; prefer `get`. */
  async getByName(name: RoleName): Promise<IRole> {
    return runApi("rolesApi", "getByName", () => {
      const found = selectAllRoles().find((r) => r.slug === name);
      if (!found) throw new MockNotFoundError("role", name);
      return found;
    });
  },

  listResources(): Promise<IRbacResource[]> {
    return runApi("rolesApi", "listResources", () =>
      [...selectAllRbacResources()].sort((a, b) => a.sortOrder - b.sortOrder),
    );
  },

  create(input: ICreateRoleInput): Promise<IRole> {
    return runApi(
      "rolesApi",
      "create",
      () => {
        if (!input.name.trim()) throw new MockValidationError("name is required", "name");
        const slug = `role-${crypto.randomUUID()}`;
        const created: IRole = {
          id: slug,
          slug,
          name: input.name.trim(),
          description: input.description?.trim() || undefined,
          isSystem: false,
          isOwnerImmutable: false,
          baseRole: input.baseRole,
          storeId: input.storeId ?? null,
          permissions: clonePermissions(input.permissions),
          createdAt: NOW(),
          updatedAt: NOW(),
        };
        useMockStore.setState((state) => ({ roles: [...state.roles, created] }));
        return created;
      },
      { payload: input },
    );
  },

  updateMeta(
    id: ID,
    patch: { name?: string; description?: string; baseRole?: RoleName },
  ): Promise<IRole> {
    return runApi(
      "rolesApi",
      "updateMeta",
      () => {
        // Mirrors the supabase guard on which base-role changes are legal.
        // The "role still in use" check has no mock counterpart: custom-role
        // assignment lives in `profiles.role_id`, which only the Supabase
        // backend models — mock sellers carry no custom role at all.
        const current = useMockStore.getState().roles.find((r) => r.id === id);
        if (current && patch.baseRole !== undefined && patch.baseRole !== current.baseRole) {
          if (current.isSystem) {
            throw new Error("O papel-base de um papel de sistema não pode ser alterado.");
          }
          if (!isAssignableBaseRole(patch.baseRole)) {
            throw new Error(
              `"${patch.baseRole}" não pode ser papel-base: a atribuição seria recusada pelo servidor.`,
            );
          }
        }
        let updated: IRole | null = null;
        useMockStore.setState((state) => {
          const roles = state.roles.map((r) => {
            if (r.id !== id) return r;
            updated = {
              ...r,
              ...(patch.name !== undefined ? { name: patch.name } : {}),
              ...(patch.description !== undefined ? { description: patch.description } : {}),
              ...(patch.baseRole !== undefined ? { baseRole: patch.baseRole } : {}),
              updatedAt: NOW(),
            };
            return updated;
          });
          return { roles };
        });
        if (!updated) throw new MockNotFoundError("role", id);
        return updated;
      },
      { payload: { id, patch } },
    );
  },

  setPermissions(id: ID, permissions: IPermission[]): Promise<IRole> {
    return runApi(
      "rolesApi",
      "setPermissions",
      () => {
        let updated: IRole | null = null;
        useMockStore.setState((state) => {
          const roles = state.roles.map((r) => {
            if (r.id !== id) return r;
            updated = { ...r, permissions: clonePermissions(permissions), updatedAt: NOW() };
            return updated;
          });
          return { roles };
        });
        if (!updated) throw new MockNotFoundError("role", id);
        return updated;
      },
      { payload: { id, count: permissions.length } },
    );
  },

  restoreDefaults(id: ID): Promise<IRole> {
    return runApi(
      "rolesApi",
      "restoreDefaults",
      () => {
        const target = selectAllRoles().find((r) => r.id === id);
        if (!target) throw new MockNotFoundError("role", id);
        const seed = buildRoleSeed().find((s) => s.slug === target.slug);
        if (!seed) {
          throw new MockValidationError(
            `Não há padrão de fábrica para o papel "${target.slug}".`,
            "id",
          );
        }
        let updated: IRole | null = null;
        useMockStore.setState((state) => {
          const roles = state.roles.map((r) => {
            if (r.id !== id) return r;
            updated = { ...r, permissions: clonePermissions(seed.permissions), updatedAt: NOW() };
            return updated;
          });
          return { roles };
        });
        return updated as unknown as IRole;
      },
      { payload: { id } },
    );
  },

  remove(id: ID): Promise<void> {
    return runApi(
      "rolesApi",
      "remove",
      () => {
        const target = selectAllRoles().find((r) => r.id === id);
        if (!target) throw new MockNotFoundError("role", id);
        // Usage check (FOLLOW-UP T15/T16): role assignment to a user is not yet
        // wired. Once a seller↔role link exists, count assigned users here.
        const assignedCount = countRoleUsage(target.id);
        if (assignedCount > 0) {
          throw new MockValidationError(
            `Não é possível excluir: ${assignedCount} usuário(s) ainda usam este papel.`,
            "id",
          );
        }
        useMockStore.setState((state) => ({ roles: state.roles.filter((r) => r.id !== id) }));
      },
      { payload: { id } },
    );
  },
};

/**
 * Counts users assigned to a role.
 *
 * FOLLOW-UP (Tasks 15/16): seller→role assignment is NOT yet cabled — there is
 * no `sellers.role_id` (or equivalent) column today, so there is no signal to
 * count against. This returns 0 for every role, which is correct: nothing can
 * have been assigned yet. When the assignment lands (T15/T16), count sellers
 * whose role == `roleId` here (and mirror the same query in the Supabase impl).
 */
function countRoleUsage(_roleId: ID): number {
  return 0;
}
