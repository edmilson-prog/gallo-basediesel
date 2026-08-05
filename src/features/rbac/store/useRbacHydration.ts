import { useEffect } from "react";
import { useAuth } from "@/features/auth/useAuth";
import { useRolesProvider } from "@/providers/data";
import { hydrateRbac, invalidateRbac } from "./rbacConfig";

/**
 * Loads the persisted role matrix into the in-memory RBAC cache (PRD-211 Task 8).
 *
 * Keyed on the **signed-in identity**, not on mount. The matrix lives behind
 * RLS: `roles`/`role_permissions` are readable by `authenticated` only, so a
 * fetch issued before sign-in comes back empty and tells us nothing. Running it
 * at boot (the hook used to mount above `<AuthProvider>`) therefore made the
 * login screen poison the cache for the whole session — see `hydrateRbac`.
 *
 * Fire-and-forget: the render is never blocked — `hasPermission()` keeps serving
 * the static fallback until the persisted matrix arrives, and subscribers
 * re-render when it does. Failures are swallowed intentionally (the fallback
 * mirrors the seed, so a missing/erroring `roles` provider leaves enforcement at
 * its legacy behavior).
 *
 * Re-hydration after the role editor saves is handled by the editor calling
 * `rehydrateRbac()` (Task 10).
 */
export function useRbacHydration(): void {
  const rolesProvider = useRolesProvider();
  const { currentUser } = useAuth();
  // Identity of the matrix to load. `roleKey` matters too: a user reassigned to
  // another role needs the cache reloaded even though the id never changed.
  const identity = currentUser
    ? `${currentUser.id}:${currentUser.roleKey ?? currentUser.role}`
    : null;

  useEffect(() => {
    // Signed out — drop the matrix so the next user never reads the previous
    // one's permissions, and `hasPermission()` returns to the static fallback.
    if (!identity) {
      invalidateRbac();
      return;
    }

    let cancelled = false;

    void rolesProvider
      .list()
      .then((roles) => {
        if (!cancelled) hydrateRbac(roles);
      })
      .catch(() => {
        // Keep the static fallback on failure — no enforcement gap.
      });

    return () => {
      cancelled = true;
    };
  }, [rolesProvider, identity]);
}

/**
 * Re-hydrates the RBAC cache from the persisted matrix on demand.
 * Used after the role editor saves (Task 10): clears the cache (briefly falling
 * back to the static matrix) and reloads the fresh persisted permissions.
 */
export async function rehydrateRbac(
  roles: Promise<import("@/shared/types").IRole[]>,
): Promise<void> {
  invalidateRbac();
  try {
    hydrateRbac(await roles);
  } catch {
    // Leave the static fallback in place on failure.
  }
}
