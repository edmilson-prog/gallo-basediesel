import type { ID, IPermission, IRbacResource, IRole } from "@/shared/types";

/** Input to create a brand-new custom role (PRD-211). */
export interface ICreateRoleInput {
  name: string;
  description?: string;
  baseRole: IRole["baseRole"];
  permissions: IPermission[];
  storeId?: ID | null;
}

/**
 * Contract for role (papel) management — RBAC roles become editable data
 * instead of a hardcoded matrix (PRD-211, Tasks 6/7).
 *
 * @see ../../../mocks/api/roles.ts
 */
export interface IRolesProvider {
  /** Lists every role (system + custom), permissions aggregated. */
  list(): Promise<IRole[]>;
  /** Resolves a single role by id, with its permission set. */
  get(id: ID): Promise<IRole>;
  /** Lists the RBAC resource catalog ordered for grouped display. */
  listResources(): Promise<IRbacResource[]>;
  /** Creates a custom role with its initial permission set. */
  create(input: ICreateRoleInput): Promise<IRole>;
  /** Patches editable metadata (name/description). */
  updateMeta(id: ID, patch: { name?: string; description?: string }): Promise<IRole>;
  /** Replaces the full permission set of a role. */
  setPermissions(id: ID, permissions: IPermission[]): Promise<IRole>;
  /** Resets a system role's permissions to the seeded defaults. */
  restoreDefaults(id: ID): Promise<IRole>;
  /** Deletes a role — blocked when users are still assigned to it. */
  remove(id: ID): Promise<void>;
}
