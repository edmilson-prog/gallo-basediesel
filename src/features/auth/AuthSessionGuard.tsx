import { useEffect } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useAuth } from "./useAuth";

/**
 * Redirects to /auth/login the moment the session becomes invalid while the user
 * is sitting on an already-mounted authenticated route.
 *
 * The `beforeLoad` route guard only runs on navigation, so a session that dies
 * mid-use — a "ghost token" the SupabaseAuthProvider's revalidation detects and
 * clears (currentUser → null) — would otherwise leave the user staring at a
 * screen whose every API call 401s. This watches the auth state reactively and
 * bounces to login (preserving `next`) so the dead session can never strand the
 * user. Mounted once inside AppLayout.
 */
export function AuthSessionGuard() {
  const { isAuthenticated, isHydrating } = useAuth();
  const navigate = useNavigate();
  const pathname = useLocation({ select: (l) => l.pathname });

  useEffect(() => {
    // Wait until hydration settles so we never redirect on the boot frame.
    if (isHydrating || isAuthenticated) return;
    void navigate({ to: "/auth/login", search: { next: pathname }, replace: true });
  }, [isAuthenticated, isHydrating, navigate, pathname]);

  return null;
}
