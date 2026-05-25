import type { ReactNode } from "react";
import type { PermissionAction, PermissionScope } from "@/shared/types";
import type { ResourceName } from "../permissions/resources";
import { usePermission } from "../hooks/usePermission";

export interface ICanProps {
  resource: ResourceName;
  action: PermissionAction;
  scope?: PermissionScope;
  /** Rendered when the user does NOT have the permission. Default: nothing. */
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * Declarative permission gate. Renders `children` when the current user has
 * the requested permission; otherwise renders `fallback` (or nothing).
 *
 *   <Can resource="commission" action="approve">
 *     <Button onClick={approve}>Aprovar</Button>
 *   </Can>
 */
export function Can({ resource, action, scope, fallback = null, children }: ICanProps) {
  const allowed = usePermission(resource, action, scope);
  return <>{allowed ? children : fallback}</>;
}
