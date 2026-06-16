/**
 * GALLO BASE DIESEL — RBAC public surface (PRD-006).
 *
 * Components, hooks and utils should always import from this barrel:
 *
 *   import { Can, usePermission, hasPermission } from "@/features/rbac";
 *
 * The internal `permissions/`, `utils/`, `hooks/`, `components/` and `pages/`
 * folders are implementation detail.
 */

// Constants
export { RESOURCES, type ResourceName } from "./permissions/resources";
export { ACTIONS } from "./permissions/actions";
export { SCOPE_ORDER } from "./permissions/scopes";
export { PERMISSIONS_MATRIX, ROLE_DESCRIPTIONS } from "./permissions/matrix";

// Helpers
export { hasPermission, type IRoleBearer } from "./utils/hasPermission";
export { compareScopes, scopeSatisfies } from "./utils/compareScopes";
export { getEffectivePermissions } from "./utils/getEffectivePermissions";
export { getCurrentUserScope } from "./utils/getCurrentUserScope";
export { auditLog, type IAuditLogParams } from "./utils/auditLog";

// Hooks
export { usePermission } from "./hooks/usePermission";
export { useCurrentRole } from "./hooks/useCurrentRole";

// Permission cache (PRD-211 Task 8) — persisted matrix with static fallback.
export {
  getRbacSnapshot,
  hydrateRbac,
  invalidateRbac,
  type RbacSnapshot,
} from "./store/rbacConfig";
export { useRbacHydration, rehydrateRbac } from "./store/useRbacHydration";
export { RbacHydrator } from "./store/RbacHydrator";

// Components
export { Can, type ICanProps } from "./components/Can";
export { Forbidden, type IForbiddenProps } from "./components/Forbidden";
