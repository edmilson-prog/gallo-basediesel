import { redirect } from "@tanstack/react-router";
import type { PermissionAction, PermissionScope, RoleName } from "@/shared/types";
import { hasPermission } from "@/features/rbac/utils/hasPermission";
import type { ResourceName } from "@/features/rbac/permissions/resources";
import { LOCALSTORAGE_USER_KEY, MOCK_USER_BY_ID } from "./mock-users";
import { readAuthSyncMirror } from "./authSession";

/**
 * Read the persisted session synchronously from localStorage.
 *
 * Used inside `beforeLoad` route hooks (and the mock data scoping) where the
 * React context is not yet available. Backend-agnostic: it reads the mirror
 * written by whichever `AuthProvider` backend is active, falling back to the
 * legacy mock key for sessions persisted before the mirror existed.
 */
export function readCurrentUserSync(): {
  id: string;
  role: RoleName;
  sellerId?: string | null;
} | null {
  if (typeof window === "undefined") return null;
  try {
    const mirror = readAuthSyncMirror();
    if (mirror) return mirror;
    // Backward-compat: the legacy key stored just the mock profile id.
    const legacyId = window.localStorage.getItem(LOCALSTORAGE_USER_KEY);
    if (!legacyId) return null;
    const profile = MOCK_USER_BY_ID.get(legacyId);
    if (!profile) return null;
    return { id: profile.id, role: profile.role, sellerId: profile.sellerId ?? null };
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
