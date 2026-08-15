import type { PermissionAction, PermissionScope } from "@/shared/types";
import { useAuth } from "@/features/auth/useAuth";
import type { ResourceName } from "../permissions/resources";
import { hasPermission } from "../utils/hasPermission";
import { useRbacVersion } from "./useRbacVersion";

/**
 * Reactive permission check for React components.
 *
 * Reads the current user from `useAuth()`, so any sign-in / sign-out
 * automatically re-runs the check and re-renders the consumer — and subscribes
 * to the RBAC cache, so a matrix that hydrates *after* the first render (the
 * normal case: the fetch is RLS-gated and only starts once the user is signed
 * in) reaches the screen without a reload.
 */
export function usePermission(
  resource: ResourceName,
  action: PermissionAction,
  requiredScope?: PermissionScope,
): boolean {
  const { currentUser } = useAuth();
  useRbacVersion();
  return hasPermission(currentUser, resource, action, requiredScope);
}
