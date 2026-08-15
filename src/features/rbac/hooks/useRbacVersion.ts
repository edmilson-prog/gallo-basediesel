import { useSyncExternalStore } from "react";
import { getRbacVersion, subscribeRbac } from "../store/rbacConfig";

/**
 * Binds a component to the RBAC cache so it re-renders when the matrix changes.
 *
 * The cache is a module-level singleton (`rbacConfig`), deliberately outside
 * React — `hasPermission()` has to stay synchronous for route guards and data
 * scoping. The cost is that hydration is invisible to the renderer: whatever a
 * component computed on its first render is what stays on screen. That is fine
 * while the static fallback and the persisted matrix agree, and wrong the
 * moment the owner edits a role.
 *
 * Call it in anything that gates UI on `hasPermission()` / `isNavItemVisible()`
 * and must reflect the persisted matrix as soon as it lands.
 *
 * @returns the current matrix version — an opaque token, useful as a `useMemo`
 *          dependency for a memoized permission computation.
 */
export function useRbacVersion(): number {
  return useSyncExternalStore(subscribeRbac, getRbacVersion, getRbacVersion);
}
