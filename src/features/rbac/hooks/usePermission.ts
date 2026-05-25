import type { PermissionAction, PermissionScope } from "@/shared/types";
import { useAuth } from "@/features/auth/useAuth";
import type { ResourceName } from "../permissions/resources";
import { hasPermission } from "../utils/hasPermission";

/**
 * Reactive permission check for React components.
 *
 * Reads the current user from `useAuth()`, so any sign-in / sign-out
 * automatically re-runs the check and re-renders the consumer.
 */
export function usePermission(
  resource: ResourceName,
  action: PermissionAction,
  requiredScope?: PermissionScope,
): boolean {
  const { currentUser } = useAuth();
  return hasPermission(currentUser, resource, action, requiredScope);
}
