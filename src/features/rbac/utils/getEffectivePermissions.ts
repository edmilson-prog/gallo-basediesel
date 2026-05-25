import type { IPermission } from "@/shared/types";
import { PERMISSIONS_MATRIX } from "../permissions/matrix";
import type { IRoleBearer } from "./hasPermission";

/**
 * Returns the full list of `IPermission` granted to the given user. Useful
 * for the RolesPage, debugging and unit tests. Returns a fresh shallow copy
 * so callers can mutate without affecting the matrix.
 */
export function getEffectivePermissions(user: IRoleBearer | null | undefined): IPermission[] {
  if (!user) return [];
  const list = PERMISSIONS_MATRIX[user.role];
  if (!list) return [];
  return list.map((p) => ({ ...p, actions: [...p.actions] }));
}
