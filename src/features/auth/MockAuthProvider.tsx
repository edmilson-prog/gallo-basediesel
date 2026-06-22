import { useCallback, useEffect, useMemo, useState } from "react";
import type { RoleName } from "@/shared/types";
import { auditLog } from "@/features/rbac/utils/auditLog";
import {
  LOCALSTORAGE_USER_KEY,
  MOCK_USER_BY_ID,
  findMockUserByEmail,
  type IUserProfile,
} from "./mock-users";
import { AuthContext, type IAuthContextValue, type IAuthResult } from "./authContext";
import { writeAuthSyncMirror } from "./authSession";

function readPersistedUserId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(LOCALSTORAGE_USER_KEY);
  } catch {
    return null;
  }
}

function persistUserId(id: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (id === null) window.localStorage.removeItem(LOCALSTORAGE_USER_KEY);
    else window.localStorage.setItem(LOCALSTORAGE_USER_KEY, id);
  } catch {
    // localStorage may be unavailable (private mode). Session-only fallback.
  }
}

/**
 * Mock auth backend — pick-a-profile sign-in backed by `mock-users.ts`.
 *
 * Extracted verbatim from the original `AuthProvider`; behaviour is unchanged,
 * with one addition: it mirrors the session via `writeAuthSyncMirror` so the
 * synchronous guards and data-scoping readers work the same regardless of
 * backend.
 */
export function MockAuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<IUserProfile | null>(null);
  const [isHydrating, setIsHydrating] = useState(true);

  useEffect(() => {
    const id = readPersistedUserId();
    if (id) {
      const profile = MOCK_USER_BY_ID.get(id) ?? null;
      setCurrentUser(profile);
      if (profile)
        writeAuthSyncMirror({
          id: profile.id,
          role: profile.role,
          roleKey: profile.roleKey,
          sellerId: profile.sellerId ?? null,
        });
    }
    setIsHydrating(false);
  }, []);

  const applySession = useCallback((profile: IUserProfile) => {
    persistUserId(profile.id);
    writeAuthSyncMirror({
      id: profile.id,
      role: profile.role,
      roleKey: profile.roleKey,
      sellerId: profile.sellerId ?? null,
    });
    setCurrentUser(profile);
    auditLog({
      actorId: profile.id,
      action: "auth.signin",
      resource: "seller",
      resourceId: profile.id,
      after: { role: profile.role, displayName: profile.displayName },
    });
  }, []);

  const signIn = useCallback(
    (profileId: string): IUserProfile | null => {
      const profile = MOCK_USER_BY_ID.get(profileId) ?? null;
      if (profile) applySession(profile);
      return profile;
    },
    [applySession],
  );

  const signInWithPassword = useCallback(
    async (email: string): Promise<IAuthResult> => {
      const profile = findMockUserByEmail(email) ?? null;
      if (!profile) {
        return {
          ok: false,
          error: "E-mail não reconhecido. Use um perfil de demonstração abaixo.",
        };
      }
      applySession(profile);
      return { ok: true, profile };
    },
    [applySession],
  );

  const signOut = useCallback(() => {
    const previous = currentUser;
    persistUserId(null);
    writeAuthSyncMirror(null);
    setCurrentUser(null);
    if (previous) {
      auditLog({
        actorId: previous.id,
        action: "auth.signout",
        resource: "seller",
        resourceId: previous.id,
        before: { role: previous.role, displayName: previous.displayName },
      });
    }
  }, [currentUser]);

  const hasRole = useCallback(
    (role: RoleName | RoleName[]): boolean => {
      if (!currentUser) return false;
      const list = Array.isArray(role) ? role : [role];
      return list.includes(currentUser.role);
    },
    [currentUser],
  );

  const value = useMemo<IAuthContextValue>(
    () => ({
      currentUser,
      userRole: currentUser?.role ?? null,
      isAuthenticated: currentUser !== null,
      isHydrating,
      // Mock has no server session, so it can never be revoked mid-use.
      sessionExpired: false,
      signIn,
      signInWithPassword,
      signOut,
      hasRole,
    }),
    [currentUser, isHydrating, signIn, signInWithPassword, signOut, hasRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
