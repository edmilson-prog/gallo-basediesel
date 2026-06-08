import { useCallback } from "react";
import { auditLog } from "@/features/rbac/utils/auditLog";
import { usePortalStore } from "../store/portalStore";
import { usePortalAuthStore } from "../store/portalAuthStore";

const DEFAULT_STORE_ID = "00000000-0000-0000-0000-000000000001";

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
      // RF-044: audit portal authentication events.
      auditLog({
        actorId: match.id,
        action: "portal_login",
        resource: "customer",
        resourceId: match.customerId,
        storeId: DEFAULT_STORE_ID,
      });
      return true;
    },
    [users, setSession],
  );

  const logout = useCallback(() => {
    if (session) {
      auditLog({
        actorId: session.portalUserId,
        action: "portal_logout",
        resource: "customer",
        resourceId: session.customerId,
        storeId: session.storeId,
      });
    }
    clearSession();
  }, [session, clearSession]);

  return { session, isAuthenticated: Boolean(session), login, logout };
}
