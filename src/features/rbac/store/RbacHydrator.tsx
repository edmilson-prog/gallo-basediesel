import { useRbacHydration } from "./useRbacHydration";

/**
 * Boot helper for the RBAC cache (PRD-211 Task 8).
 *
 * Renders nothing — it exists only to run {@link useRbacHydration} from inside
 * the provider tree. It must sit under `DataProvidersProvider` (for the `roles`
 * provider) **and** under `AuthProvider` (the matrix is RLS-gated to
 * `authenticated`, and hydration re-runs per identity). Hydration is
 * fire-and-forget; the static fallback covers the window before the persisted
 * matrix loads.
 */
export function RbacHydrator(): null {
  useRbacHydration();
  return null;
}
