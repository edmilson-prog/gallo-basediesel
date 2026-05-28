import { useCallback } from "react";
import { useSellersProvider } from "@/providers/data";
import { usePwaAuthStore } from "../store/pwaAuthStore";

const DEFAULT_STORE_ID = "store-matriz";

/**
 * Mock PWA auth (PRD-070 RF-005). `login` matches a seller by e-mail (any
 * non-empty password) and falls back to the first active seller for demo
 * convenience. Mirrors the storefront customer mock auth.
 */
export function usePwaAuth() {
  const provider = useSellersProvider();
  const session = usePwaAuthStore((s) => s.session);
  const setSession = usePwaAuthStore((s) => s.setSession);
  const clearSession = usePwaAuthStore((s) => s.clearSession);

  const login = useCallback(
    async (email: string, _password: string): Promise<boolean> => {
      const trimmed = email.trim().toLowerCase();
      const sellers = await provider.list({ storeId: DEFAULT_STORE_ID, active: true });
      if (sellers.length === 0) return false;
      const match =
        sellers.find((s) => s.email.toLowerCase() === trimmed) ?? (trimmed ? sellers[0] : null);
      if (!match) return false;
      setSession({
        sellerId: match.id,
        sellerName: match.fullName,
        storeId: match.storeId,
        loggedInAt: new Date().toISOString(),
      });
      return true;
    },
    [provider, setSession],
  );

  return { session, isAuthenticated: Boolean(session), login, logout: clearSession };
}
