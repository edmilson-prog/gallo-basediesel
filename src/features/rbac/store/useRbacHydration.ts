import { useEffect } from "react";
import { useRolesProvider } from "@/providers/data";
import { hydrateRbac, invalidateRbac } from "./rbacConfig";

/**
 * Loads the persisted role matrix into the in-memory RBAC cache once at boot
 * (PRD-211 Task 8).
 *
 * Fire-and-forget: the render is never blocked — `hasPermission()` keeps serving
 * the static fallback until the persisted matrix arrives. Failures are swallowed
 * intentionally (the fallback already mirrors the seed, so a missing/erroring
 * `roles` provider leaves enforcement at its legacy behavior).
 *
 * Re-hydration after the role editor saves is handled by the editor calling
 * `invalidateRbac()` + re-running its `roles.list()` query (Task 10); this hook
 * only seeds the cache on first mount.
 */
export function useRbacHydration(): void {
  const rolesProvider = useRolesProvider();

  useEffect(() => {
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
  }, [rolesProvider]);
}

/**
 * Re-hydrates the RBAC cache from the persisted matrix on demand.
 * Used after the role editor saves (Task 10): clears the cache (briefly falling
 * back to the static matrix) and reloads the fresh persisted permissions.
 */
export async function rehydrateRbac(roles: Promise<import("@/shared/types").IRole[]>): Promise<void> {
  invalidateRbac();
  try {
    hydrateRbac(await roles);
  } catch {
    // Leave the static fallback in place on failure.
  }
}
