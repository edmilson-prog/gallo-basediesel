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
  /** Pick-a-profile sign-in (mock card picker). No-op in the supabase backend. */
  signIn: (profileId: string) => IUserProfile | null;
  /** Email/password sign-in. Implemented by both backends. */
  signInWithPassword: (email: string, password: string) => Promise<IAuthResult>;
  signOut: () => void;
  hasRole: (role: RoleName | RoleName[]) => boolean;
}

export const AuthContext = createContext<IAuthContextValue | null>(null);
