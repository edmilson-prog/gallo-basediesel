import { redirect } from "@tanstack/react-router";
import type { PermissionAction, PermissionScope, RoleName } from "@/shared/types";
import { hasPermission } from "@/features/rbac/utils/hasPermission";
import type { ResourceName } from "@/features/rbac/permissions/resources";
import { LOCALSTORAGE_USER_KEY, MOCK_USER_BY_ID } from "./mock-users";

/**
 * Read the persisted mock user directly from localStorage.
 *
 * Used inside `beforeLoad` route hooks where the React context is not yet
 * available. Mirrors what `AuthProvider` does on hydration.
 */
export function readCurrentUserSync(): { id: string; role: RoleName } | null {
  if (typeof window === "undefined") return null;
  try {
    const id = window.localStorage.getItem(LOCALSTORAGE_USER_KEY);
    if (!id) return null;
    const profile = MOCK_USER_BY_ID.get(id);
    if (!profile) return null;
    return { id: profile.id, role: profile.role };
  } catch {
    return null;
  }
}

export interface IRequirePermission {
  resource: ResourceName;
  action: PermissionAction;
  scope?: PermissionScope;
}

/**
 * Guard for routes that require authentication.
 *
 * Throws a TanStack `redirect()` to /auth/login (with ?next preserved) when
 * no user is logged in. Pass `roles` to additionally restrict by role —
 * unauthorized roles get redirected to /sem-permissao. Pass `permission` for
 * fine-grained RBAC checks (resource × action × scope) — combined with the
 * RBAC matrix from PRD-006.
 *
 * When both `roles` and `permission` are passed, the user must satisfy BOTH.
 */
export function requireAuth(
  pathname: string,
  roles?: RoleName[],
  permission?: IRequirePermission,
): void {
  const user = readCurrentUserSync();
  if (!user) {
    throw redirect({
      to: "/auth/login",
      search: { next: pathname },
    });
  }
  if (roles && roles.length > 0 && !roles.includes(user.role)) {
    throw redirect({ to: "/sem-permissao" });
  }
  if (permission) {
    const allowed = hasPermission(user, permission.resource, permission.action, permission.scope);
    if (!allowed) {
      throw redirect({ to: "/sem-permissao" });
    }
  }
}
