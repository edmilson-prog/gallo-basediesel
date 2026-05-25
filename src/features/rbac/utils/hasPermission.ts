import type { PermissionAction, PermissionScope, RoleName } from "@/shared/types";
import { EFFECTIVE_PERMISSIONS_INDEX } from "../permissions/matrix";
import type { ResourceName } from "../permissions/resources";
import { scopeSatisfies } from "./compareScopes";

/**
 * Anything that carries a `role` field is treated as a "user" by the RBAC
 * helpers. The auth layer's `IMockUserProfile` and the future Supabase user
 * both satisfy this shape, so the helpers stay decoupled from a specific
 * user representation.
 */
export interface IRoleBearer {
  role: RoleName;
}

/**
 * Synchronous permission check — the cornerstone of frontend RBAC.
 *
 * ⚠️ This is **UX/UI discipline**, not security. A motivated attacker can
 * always patch the in-memory matrix or fake a user. Real protection lives in
 * the Supabase RLS layer (Fase 2).
 *
 * @returns true when the user holds an `(action)` permission on `(resource)`
 *          whose scope is ≥ `requiredScope` (defaults to `own`).
 */
export function hasPermission(
  user: IRoleBearer | null | undefined,
  resource: ResourceName,
  action: PermissionAction,
  requiredScope: PermissionScope = "own",
): boolean {
  if (!user) return false;
  const index = EFFECTIVE_PERMISSIONS_INDEX[user.role];
  if (!index) return false;
  const entry = index[resource];
  if (!entry) return false;
  if (!entry.actions.has(action)) return false;
  return scopeSatisfies(entry.scope, requiredScope);
}
