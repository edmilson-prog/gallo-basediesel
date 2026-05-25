import type { PermissionScope } from "@/shared/types";
import { SCOPE_ORDER } from "../permissions/scopes";

const SCOPE_RANK: Record<PermissionScope, number> = (() => {
  const out = {} as Record<PermissionScope, number>;
  SCOPE_ORDER.forEach((s, i) => {
    out[s] = i;
  });
  return out;
})();

/**
 * Compare two scopes according to `SCOPE_ORDER` (`own < team < store < all`).
 * Returns -1 / 0 / 1, just like the `Array.prototype.sort` comparator.
 */
export function compareScopes(a: PermissionScope, b: PermissionScope): -1 | 0 | 1 {
  const ra = SCOPE_RANK[a];
  const rb = SCOPE_RANK[b];
  if (ra < rb) return -1;
  if (ra > rb) return 1;
  return 0;
}

/** True if `actual` ≥ `required` in the scope hierarchy. */
export function scopeSatisfies(actual: PermissionScope, required: PermissionScope): boolean {
  return compareScopes(actual, required) >= 0;
}
