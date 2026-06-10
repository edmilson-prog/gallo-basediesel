import { useContext, useEffect } from "react";
import { setObservabilityUser } from "@/shared/lib/observability";
import { AuthContext } from "./authContext";

/**
 * Mirrors the signed-in user's opaque ids (sellerId/storeId/role) into the
 * error-tracking layer (PRD-110, RF-003). Renders nothing; a no-op when
 * Sentry is not configured. Mounted inside <AuthProvider> so it observes
 * whichever backend (mock/supabase) is active.
 */
export function ObservabilityUserSync() {
  const auth = useContext(AuthContext);
  const user = auth?.currentUser ?? null;
  const role = auth?.userRole ?? null;

  useEffect(() => {
    if (!user) {
      setObservabilityUser(null);
      return;
    }
    setObservabilityUser({
      id: user.id,
      role,
      storeId: user.storeId || null,
      sellerId: user.sellerId ?? null,
    });
  }, [user, role]);

  return null;
}
