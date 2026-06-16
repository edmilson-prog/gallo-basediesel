import type { PermissionScope } from "@/shared/types";
import { EFFECTIVE_PERMISSIONS_INDEX } from "../permissions/matrix";
import type { ResourceName } from "../permissions/resources";
import type { IRoleBearer } from "./hasPermission";

/**
 * Canonical scope resolver: returns the broadest scope the user holds on the
 * given resource (`own` / `team` / `store` / `all`), or `null` if the user has
 * no entry for it.
 *
 * This is foundational public API (PRD-006). When a `team` scope needs to be
 * expanded into concrete seller ids, use `resolveTeamMemberIds` with the user's
 * department members. Data isolation itself is enforced by Supabase RLS
 * governed by `base_role`; UI scope filtering is not yet wired into list hooks.
 */
export function getCurrentUserScope(
  user: IRoleBearer | null | undefined,
  resource: ResourceName,
): PermissionScope | null {
  if (!user) return null;
  const index = EFFECTIVE_PERMISSIONS_INDEX[user.role];
  if (!index) return null;
  return index[resource]?.scope ?? null;
}
