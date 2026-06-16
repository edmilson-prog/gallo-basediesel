import type { PermissionScope } from "@/shared/types";

/**
 * Scope hierarchy, ascending.
 *
 * Whoever has `store` implicitly has `team` and `own`; whoever has `all`
 * has everything. The `compareScopes()` helper uses this ordering.
 *
 * `team` resolves to the members of the user's department (PRD-211) via
 * `resolveTeamMemberIds` (a user without department peers degrades to `own`).
 * Actual data isolation is enforced by Supabase RLS governed by the user's
 * `base_role`; this ordering only governs the permission hierarchy.
 */
export const SCOPE_ORDER = [
  "own",
  "team",
  "store",
  "all",
] as const satisfies readonly PermissionScope[];

export type { PermissionScope };
