import type { IPermission, IRole, PermissionAction } from "@/shared/types";
import { EFFECTIVE_PERMISSIONS_INDEX, type ResourceIndex } from "../permissions/matrix";
import type { ResourceName } from "../permissions/resources";

/**
 * In-memory RBAC permission cache (PRD-211 Task 8).
 *
 * `hasPermission()` is a synchronous, hot-path check that historically read
 * straight from the hardcoded `EFFECTIVE_PERMISSIONS_INDEX`. Now that roles are
 * editable, persisted data (`IRole[]` from the `roles` provider), this singleton
 * holds a synchronous snapshot of the effective matrix indexed by role slug.
 *
 * ⚠️ **Parity guarantee:** before hydration (and after `invalidateRbac()`),
 * `getRbacSnapshot()` returns an index built verbatim from
 * `EFFECTIVE_PERMISSIONS_INDEX`, so the result of every permission check is
 * byte-for-byte identical to the pre-PRD-211 behavior. The persisted matrix only
 * takes over once `hydrateRbac()` runs at boot (fire-and-forget), and re-hydration
 * after the role editor saves keeps the cache fresh (RF-022 / RNF-002).
 *
 * This is **UX/UI discipline**, not a security boundary. Real enforcement lives
 * in the Supabase RLS layer, governed by `base_role` in the JWT.
 */

export interface RbacSnapshot {
  /** Effective permission index keyed by role slug (system slug === RoleName). */
  byRole: Record<string, ResourceIndex>;
  /** True once the persisted matrix has been loaded into the cache. */
  hydrated: boolean;
}

/**
 * Build the fallback index from the static matrix.
 *
 * Returns a fresh object each call so callers can never mutate the shared
 * `EFFECTIVE_PERMISSIONS_INDEX` (the inner `ResourceIndex` entries are reused by
 * reference, but they hold `ReadonlySet`s and are treated as immutable).
 */
function buildFallbackByRole(): Record<string, ResourceIndex> {
  const out: Record<string, ResourceIndex> = {};
  for (const role of Object.keys(EFFECTIVE_PERMISSIONS_INDEX)) {
    out[role] = EFFECTIVE_PERMISSIONS_INDEX[role as keyof typeof EFFECTIVE_PERMISSIONS_INDEX];
  }
  return out;
}

/**
 * Build a `ResourceIndex` from a role's persisted permission set.
 * Mirrors the shape of `EFFECTIVE_PERMISSIONS_INDEX` entries: `O(1)` lookups via
 * `Set<PermissionAction>` per resource.
 */
function indexPermissions(permissions: IPermission[]): ResourceIndex {
  const index: ResourceIndex = {};
  for (const perm of permissions) {
    index[perm.resource as ResourceName] = {
      actions: new Set<PermissionAction>(perm.actions),
      scope: perm.scope,
    };
  }
  return index;
}

// Module-level singleton state — intentionally outside React.
const state: RbacSnapshot = {
  byRole: {},
  hydrated: false,
};

/**
 * Returns the current effective-permissions snapshot.
 *
 * Until {@link hydrateRbac} runs (or after {@link invalidateRbac}), this returns
 * a fresh fallback index derived from the static matrix — identical to the
 * legacy behavior, with no enforcement gap during the boot window.
 */
export function getRbacSnapshot(): RbacSnapshot {
  if (!state.hydrated) {
    return { byRole: buildFallbackByRole(), hydrated: false };
  }
  return state;
}

/**
 * Replaces the cache with the effective matrix derived from persisted roles.
 * Keyed by `role.slug` (for the 7 system roles, `slug === RoleName`).
 */
export function hydrateRbac(roles: IRole[]): void {
  const byRole: Record<string, ResourceIndex> = {};
  for (const role of roles) {
    byRole[role.slug] = indexPermissions(role.permissions);
  }
  state.byRole = byRole;
  state.hydrated = true;
}

/**
 * Clears the cache so the next {@link getRbacSnapshot} call falls back to the
 * static matrix until {@link hydrateRbac} runs again. Used after the role editor
 * saves, before re-hydrating with the fresh persisted matrix.
 */
export function invalidateRbac(): void {
  state.byRole = {};
  state.hydrated = false;
}
