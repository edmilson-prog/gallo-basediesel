import type { IRole, RoleName } from "@/shared/types";

/**
 * Base roles that can never back a staff assignment — the single source of truth
 * for a rule that the Edge Function `set-seller-role` enforces server-side:
 *
 * - `Owner`  → "cannot assign the owner role" (403). Promoting someone to Owner
 *   through the UI would be privilege escalation, so it is refused outright.
 * - `Cliente` → "cannot assign a customer role to a seller" (403). Customer
 *   roles are portal access, not team access; assigning one bricks the login.
 *
 * This used to live as an inline filter in `ChangeRoleDialog` only, so the role
 * *creation* form happily offered `Owner` as a base — producing a role that
 * appears in the assignment dropdown and can never be assigned. Both screens now
 * read this list.
 */
export const NON_ASSIGNABLE_BASE_ROLES: readonly RoleName[] = ["Owner", "Cliente"];

/** True when a base role can back a staff assignment (mirrors the Edge guard). */
export function isAssignableBaseRole(baseRole: RoleName): boolean {
  return !NON_ASSIGNABLE_BASE_ROLES.includes(baseRole);
}

/**
 * True when `role` can be assigned to a seller of `storeId`.
 *
 * Mirrors the Edge guard exactly: the immutable Owner role is out, roles whose
 * base is not assignable are out, and a store-scoped role only applies to its
 * own store (a global role — `storeId == null` — applies everywhere).
 */
export function isAssignableRole(role: IRole, storeId?: string | null): boolean {
  if (role.isOwnerImmutable) return false;
  if (!isAssignableBaseRole(role.baseRole)) return false;
  if (role.storeId != null && role.storeId !== storeId) return false;
  return true;
}

/** Assignable roles, system ones first, then alphabetical — dropdown order. */
export function sortAssignableRoles(roles: IRole[]): IRole[] {
  return [...roles].sort((a, b) =>
    a.isSystem === b.isSystem ? a.name.localeCompare(b.name) : a.isSystem ? -1 : 1,
  );
}
