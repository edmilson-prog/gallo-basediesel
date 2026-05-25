import type { PermissionScope } from "@/shared/types";
import { EFFECTIVE_PERMISSIONS_INDEX } from "../permissions/matrix";
import type { ResourceName } from "../permissions/resources";
import type { IRoleBearer } from "./hasPermission";

/**
 * Returns the broadest scope the user holds on the given resource, or `null`
 * if the user has no entry for it. Consumed by list hooks to know how much
 * data to fetch (own / team / store / all).
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
