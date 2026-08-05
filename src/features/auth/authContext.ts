import { createContext } from "react";
import type { RoleName } from "@/shared/types";
import type { IUserProfile } from "./mock-users";

/** Outcome of an email/password sign-in attempt. */
export interface IAuthResult {
  ok: boolean;
  /** User-facing error message (pt-BR) when `ok` is false. */
  error?: string;
  /** Resolved profile on success — the caller navigates to `profile.defaultRedirect`. */
  profile?: IUserProfile | null;
  /** Set by the login route's access gate when a successful auth is then
   *  blocked by the work-schedule rule (PRD-212). */
  blocked?: { reason: "outside_hours" | "suspended"; nextOpenAt?: string | null };
  /**
   * The credentials were right, but the account has two-factor enabled and the
   * session is still `aal1`. The caller must collect a TOTP code and finish via
   * `completeMfaChallenge`. `ok` stays false — the user is NOT signed in yet.
   */
  mfaRequired?: boolean;
}

/**
 * Auth context surface, shared by both backends (mock and supabase). Kept in
 * its own module so the providers and `useAuth` can import it without cycles.
 */
export interface IAuthContextValue {
  currentUser: IUserProfile | null;
  userRole: RoleName | null;
  isAuthenticated: boolean;
  /** True until the first session read completes. */
  isHydrating: boolean;
  /**
   * Set true ONLY when the server session was confirmed revoked mid-use (the
   * ghost-session case the revalidation detects) — never on a transient
   * profile-read failure or an intentional signOut. AuthSessionGuard watches
   * this (not `!isAuthenticated`, which is ambiguous) to bounce to login.
   * Always false in the mock backend (no server session to expire).
   */
  sessionExpired: boolean;
  /** Pick-a-profile sign-in (mock card picker). No-op in the supabase backend. */
  signIn: (profileId: string) => IUserProfile | null;
  /** Email/password sign-in. Implemented by both backends. */
  signInWithPassword: (email: string, password: string) => Promise<IAuthResult>;
  /**
   * True while a session exists but is waiting on the second factor (aal1 with
   * a verified TOTP factor). Such a session is deliberately NOT authenticated:
   * `currentUser` stays null so the route guards keep the user at the login
   * screen until the code is confirmed. Always false in the mock backend.
   */
  mfaPending: boolean;
  /** Answers the pending TOTP challenge and completes the sign-in. */
  completeMfaChallenge: (code: string) => Promise<IAuthResult>;
  /** Gives up on the pending challenge and drops the half-authenticated session. */
  cancelMfaChallenge: () => void;
  signOut: () => void;
  hasRole: (role: RoleName | RoleName[]) => boolean;
}

export const AuthContext = createContext<IAuthContextValue | null>(null);
