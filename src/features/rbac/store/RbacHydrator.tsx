import { useRbacHydration } from "./useRbacHydration";

/**
 * Mount-once boot helper for the RBAC cache (PRD-211 Task 8).
 *
 * Renders nothing — it exists only to run {@link useRbacHydration} from inside
 * the provider tree (it must sit under `DataProvidersProvider` so the `roles`
 * provider is available). Hydration is fire-and-forget; the static fallback
 * covers the window before the persisted matrix loads.
 */
export function RbacHydrator(): null {
  useRbacHydration();
  return null;
}
