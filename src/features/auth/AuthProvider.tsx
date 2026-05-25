import { createContext, useCallback, useEffect, useMemo, useState } from "react";
import type { RoleName } from "@/shared/types";
import { LOCALSTORAGE_USER_KEY, MOCK_USER_BY_ID, type IMockUserProfile } from "./mock-users";

export interface IAuthContextValue {
  currentUser: IMockUserProfile | null;
  userRole: RoleName | null;
  isAuthenticated: boolean;
  /** True until the first read from localStorage completes. */
  isHydrating: boolean;
  signIn: (profileId: string) => IMockUserProfile | null;
  signOut: () => void;
  hasRole: (role: RoleName | RoleName[]) => boolean;
}

export const AuthContext = createContext<IAuthContextValue | null>(null);

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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<IMockUserProfile | null>(null);
  const [isHydrating, setIsHydrating] = useState(true);

  useEffect(() => {
    const id = readPersistedUserId();
    if (id) {
      const profile = MOCK_USER_BY_ID.get(id) ?? null;
      setCurrentUser(profile);
    }
    setIsHydrating(false);
  }, []);

  const signIn = useCallback((profileId: string): IMockUserProfile | null => {
    const profile = MOCK_USER_BY_ID.get(profileId) ?? null;
    if (profile) {
      persistUserId(profile.id);
      setCurrentUser(profile);
    }
    return profile;
  }, []);

  const signOut = useCallback(() => {
    persistUserId(null);
    setCurrentUser(null);
  }, []);

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
      signIn,
      signOut,
      hasRole,
    }),
    [currentUser, isHydrating, signIn, signOut, hasRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
