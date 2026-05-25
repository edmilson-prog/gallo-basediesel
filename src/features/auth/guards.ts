import { redirect } from "@tanstack/react-router";
import type { RoleName } from "@/shared/types";
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

/**
 * Guard for routes that require authentication.
 *
 * Throws a TanStack `redirect()` to /auth/login (with ?next preserved) when
 * no user is logged in. Pass `roles` to additionally restrict by role —
 * unauthorized roles get redirected to /sem-permissao.
 */
export function requireAuth(pathname: string, roles?: RoleName[]): void {
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
}
