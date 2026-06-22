import { useEffect } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useAuth } from "./useAuth";

/**
 * Redirects to /auth/login when the server session is confirmed revoked while
 * the user sits on an already-mounted authenticated route.
 *
 * It watches `sessionExpired` — set ONLY by the provider's revalidation when
 * getUser() confirms the session is dead — NOT `!isAuthenticated`. That
 * distinction matters: `currentUser` can be null for benign reasons (a
 * transient profiles-read blip on a valid session, or the brief boot window),
 * and an intentional signOut already navigates on its own. Reacting to those
 * would log out a working user or race the explicit logout/switch-profile
 * navigation. The `beforeLoad` route guard only runs on navigation, so this
 * covers the dies-mid-session case it can't. Mounted once inside AppLayout.
 */
export function AuthSessionGuard() {
  const { sessionExpired } = useAuth();
  const navigate = useNavigate();
  const pathname = useLocation({ select: (l) => l.pathname });

  useEffect(() => {
    if (!sessionExpired) return;
    void navigate({ to: "/auth/login", search: { next: pathname }, replace: true });
  }, [sessionExpired, navigate, pathname]);

  return null;
}
