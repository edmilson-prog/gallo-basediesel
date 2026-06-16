import type { ID, ISeller } from "@/shared/types";

/**
 * Resolves the set of seller ids a `team`-scoped user is allowed to see
 * (PRD-211). A `team` holder may see their own records plus those of every
 * other seller in the SAME department.
 *
 * The function is pure: the caller supplies the department's members (e.g.
 * `sellers.list({ storeId })` filtered by the current user's `departmentId`),
 * so resolution has no side effects and is trivially testable.
 *
 * Semantics:
 * - Self is ALWAYS included, even if absent from `departmentMembers` (defensive).
 * - When the user has no department peers (empty list or only self), the result
 *   is just `[currentSellerId]` — i.e. `team` degrades to `own`, never widening.
 * - Output is de-duplicated and deterministic: self first, then the remaining
 *   ids sorted lexicographically.
 *
 * NOTE: this is a frontend foundation. Actual data isolation is enforced by
 * Supabase RLS governed by the user's `base_role`; UI scope filtering is not
 * yet wired into list hooks (see `getCurrentUserScope`).
 *
 * @param currentSellerId The id of the acting user.
 * @param departmentMembers The members of the acting user's department.
 * @returns The de-duplicated, ordered list of visible seller ids.
 */
export function resolveTeamMemberIds(
  currentSellerId: ID,
  departmentMembers: ISeller[],
): ID[] {
  const others = departmentMembers
    .map((member) => member.id)
    .filter((id) => id !== currentSellerId);

  const uniqueOthers = Array.from(new Set(others)).sort();

  return [currentSellerId, ...uniqueOthers];
}
