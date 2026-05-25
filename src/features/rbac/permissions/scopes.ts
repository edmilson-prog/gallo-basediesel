import type { PermissionScope } from "@/shared/types";

/**
 * Scope hierarchy, ascending.
 *
 * Whoever has `store` implicitly has `team` and `own`; whoever has `all`
 * has everything. The `compareScopes()` helper uses this ordering.
 *
 * `team` is reserved for the post-MVP Equipes feature — until then a holder
 * of `team` behaves exactly like a holder of `own`.
 */
export const SCOPE_ORDER = [
  "own",
  "team",
  "store",
  "all",
] as const satisfies readonly PermissionScope[];

export type { PermissionScope };
