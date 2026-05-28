import { useCallback } from "react";
import { usePortalStore } from "../store/portalStore";
import { usePortalAuthStore } from "../store/portalAuthStore";

const DEFAULT_STORE_ID = "store-matriz";

/**
 * Mock auth for the B2B portal (PRD-071 RF-007). Matches a portal user by
 * e-mail; falls back to the first admin for demo convenience.
 */
export function usePortalAuth() {
  const users = usePortalStore((s) => s.users);
  const session = usePortalAuthStore((s) => s.session);
  const setSession = usePortalAuthStore((s) => s.setSession);
  const clearSession = usePortalAuthStore((s) => s.clearSession);

  const login = useCallback(
    (email: string, _password: string): boolean => {
      const trimmed = email.trim().toLowerCase();
      if (users.length === 0) return false;
      const match =
        users.find((u) => u.email.toLowerCase() === trimmed && u.isActive) ??
        users.find((u) => u.role === "admin") ??
        users[0];
      if (!match) return false;
      setSession({
        portalUserId: match.id,
        customerId: match.customerId,
        userName: match.name,
        role: match.role,
        storeId: DEFAULT_STORE_ID,
        loggedInAt: new Date().toISOString(),
      });
      return true;
    },
    [users, setSession],
  );

  return { session, isAuthenticated: Boolean(session), login, logout: clearSession };
}
