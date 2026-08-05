import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { RoleName } from "@/shared/types";
import { getSupabaseClient } from "@/shared/lib/supabase";
import { AuthContext, type IAuthContextValue, type IAuthResult } from "./authContext";
import type { IUserProfile } from "./mock-users";
import { readAuthSyncMirror, writeAuthSyncMirror } from "./authSession";
import { isInvalidSessionError } from "./sessionValidity";
import { defaultRedirectForRole, mapDbRoleToRoleName, roleGroup } from "./roleMap";
import { getVerifiedTotpFactor, readMfaGate, verifyTotpChallenge } from "./mfa";

/** Row shape of `public.profiles` (PRD-107 slice). */
interface ProfileRow {
  auth_user_id: string;
  seller_id: string | null;
  store_id: string;
  role: string;
  /** Effective role override (custom role slug). NULL = run on the base role. */
  role_id: string | null;
  display_name: string;
  email: string | null;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

/** Builds the auth-source-agnostic profile from a DB row + the auth user. */
function buildProfile(row: ProfileRow, user: User): IUserProfile {
  const role = mapDbRoleToRoleName(row.role);
  return {
    id: row.auth_user_id,
    role,
    // Custom-role override resolves the bespoke permission set; falling back to
    // the base role slug (=== RoleName) preserves today's behavior for everyone
    // without a custom role.
    roleKey: row.role_id ?? role,
    group: roleGroup(role),
    email: row.email ?? user.email ?? "",
    displayName: row.display_name,
    storeLabel: "GALLO",
    avatarInitials: initials(row.display_name),
    description: row.role,
    defaultRedirect: defaultRedirectForRole(role),
    storeId: row.store_id,
    accessibleStoreIds: row.store_id ? [row.store_id] : undefined,
    sellerId: row.seller_id ?? undefined,
  };
}

/**
 * Outcome of resolving a profile. CRITICAL distinction: a transient read
 * failure (`error`) must NEVER be treated like a genuine missing profile
 * (`absent`) — collapsing both to null let a profiles-query hiccup during a
 * valid, refreshed session zero the user and bounce them to login.
 */
type ProfileResolution =
  | { status: "ok"; profile: IUserProfile }
  | { status: "absent" } // authenticated, but no profiles row (deterministic)
  | { status: "error" }; // network / 5xx / RLS timeout — inconclusive, keep the session

/**
 * Resolves the profile for an authenticated user from the `profiles` table.
 *
 * Uses maybeSingle() so "no row" is data:null/error:null (→ absent), cleanly
 * separated from a query error (→ error). One short retry absorbs a transient
 * blip (e.g. a cold start or an RLS statement_timeout) before concluding.
 *
 * The slice queries the table directly (RLS: select-self). Once the Custom
 * Access Token Hook (PRD-107) is enabled and RLS (PRD-103) lands, this can read
 * the claims straight off `user.app_metadata` and skip the round-trip.
 */
async function resolveProfile(supabase: SupabaseClient, user: User): Promise<ProfileResolution> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await supabase
      .from("profiles")
      .select("auth_user_id, seller_id, store_id, role, role_id, display_name, email")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (data) return { status: "ok", profile: buildProfile(data as ProfileRow, user) };
    if (!error) return { status: "absent" }; // no row, no error → genuinely no profile
    if (attempt === 0) await new Promise((r) => setTimeout(r, 400)); // transient → retry once
  }
  return { status: "error" };
}

function translateAuthError(message: string): string {
  if (/invalid login credentials/i.test(message)) return "E-mail ou senha inválidos.";
  if (/email not confirmed/i.test(message)) return "E-mail ainda não confirmado.";
  return "Não foi possível entrar. Tente novamente.";
}

/**
 * Supabase auth backend (PRD-107 slice) — real email/password login. Exposes
 * the exact same `IAuthContextValue` as the mock backend, so consumers and the
 * synchronous guards/data-scoping readers are unaffected.
 */
export function SupabaseAuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<IUserProfile | null>(null);
  const [isHydrating, setIsHydrating] = useState(true);
  // Set only when the server session is confirmed revoked mid-use (ghost
  // session) — AuthSessionGuard watches this, NOT currentUser, so a transient
  // profile-read failure or an intentional signOut never bounces to login.
  const [sessionExpired, setSessionExpired] = useState(false);
  // A session exists but still owes its second factor (see the gate in `apply`).
  const [mfaPending, setMfaPending] = useState(false);
  // Mirror of currentUser readable inside async callbacks without re-subscribing
  // the effect — lets revalidate() recover a boot-blip (valid session, profile
  // failed to load) without staleness.
  const currentUserRef = useRef<IUserProfile | null>(null);
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  useEffect(() => {
    const supabase = getSupabaseClient();
    let active = true;

    const apply = async (user: User | null | undefined) => {
      if (!user) {
        if (active) {
          setCurrentUser(null);
          setMfaPending(false);
          writeAuthSyncMirror(null);
        }
        return;
      }
      // Two-factor gate. A session that COULD reach aal2 but has not is only
      // half-authenticated: the credentials were accepted, the second factor was
      // not. It must not become a logged-in app session — otherwise closing the
      // tab mid-challenge and reopening it would walk straight past the code.
      // Users without an enrolled factor never take this branch.
      const gate = await readMfaGate();
      if (!active) return;
      if (gate === "challenge_required") {
        setMfaPending(true);
        setCurrentUser(null);
        writeAuthSyncMirror(null);
        return;
      }
      setMfaPending(false);
      const res = await resolveProfile(supabase, user);
      if (!active) return;
      // Transient profile-read failure on a VALID auth session: keep whatever we
      // had. Zeroing here would let a hiccup (e.g. on the hourly TOKEN_REFRESHED)
      // log out a working user. Never do that. revalidate() recovers it.
      if (res.status === "error") return;
      // "ok" → set the profile; "absent" → authenticated with no profiles row,
      // so the user cannot use the app and must be cleared (guard → login).
      const profile = res.status === "ok" ? res.profile : null;
      // A valid session was just (re)established → clear any prior expiry signal.
      if (profile) setSessionExpired(false);
      setCurrentUser(profile);
      writeAuthSyncMirror(
        profile
          ? {
              id: profile.id,
              role: profile.role,
              roleKey: profile.roleKey,
              sellerId: profile.sellerId ?? null,
            }
          : null,
      );
    };

    /**
     * Confirms the persisted session still exists server-side. A "ghost" token
     * survives in localStorage after the session is revoked elsewhere (e.g. a
     * global signOut on another device, or the idle-timeout firing in another
     * tab): getSession() returns it happily, but every Edge Function 401s with
     * "invalid session". getUser() round-trips to the auth server, so it detects
     * the revocation. Transient/network errors are ignored (isInvalidSessionError)
     * so a hiccup never logs anyone out.
     */
    const revalidate = async () => {
      if (!readAuthSyncMirror()) return; // nothing to validate (already logged out)
      try {
        const { data, error } = await supabase.auth.getUser();
        if (!active) return;
        if (isInvalidSessionError(error)) {
          // Confirmed ghost session → signal the guard, drop local tokens, clear.
          setSessionExpired(true);
          void supabase.auth.signOut({ scope: "local" });
          await apply(null);
          return;
        }
        // Session is valid. If the profile failed to load earlier (a boot-blip
        // left currentUser null on a live session), re-resolve it now instead of
        // leaving the app profileless — never strand a valid session.
        if (data?.user && !currentUserRef.current) await apply(data.user);
      } catch {
        // getUser normally resolves with { error }; guard against an unexpected
        // SDK throw becoming an unhandled rejection. Never log out on this path.
      }
    };

    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        await apply(data.session?.user);
        // Booting with a locally-persisted token: confirm it is still live so a
        // ghost session redirects to login instead of trapping the user. Fire and
        // forget — don't delay hydration behind a getUser() round-trip.
        if (data.session?.user) void revalidate();
      })
      .finally(() => {
        if (active) setIsHydrating(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      void apply(session?.user);
    });

    // Re-confirm the session whenever the tab regains focus — that is exactly
    // when a session revoked while the tab was idle needs to be caught.
    const onVisible = () => {
      if (document.visibilityState === "visible") void revalidate();
    };
    document.addEventListener("visibilitychange", onVisible);

    // A tab kept continuously in focus never fires visibilitychange, and
    // supabase-js silently swallows a refresh failure on a revoked token (no
    // SIGNED_OUT), so without this a session revoked externally would leave the
    // tab in the ghost-session limbo indefinitely. Poll only while visible.
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") void revalidate();
    }, 120_000);

    return () => {
      active = false;
      sub.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(intervalId);
    };
  }, []);

  // Pick-a-profile sign-in is mock-only; no-op here so the contract is honoured.
  const signIn = useCallback((): IUserProfile | null => null, []);

  /** Shared tail of a completed sign-in (password-only, or password + TOTP). */
  const finalizeSignIn = useCallback(
    async (supabase: SupabaseClient, user: User): Promise<IAuthResult> => {
      const res = await resolveProfile(supabase, user);
      if (res.status !== "ok") {
        return {
          ok: false,
          error:
            res.status === "absent"
              ? "Login efetuado, mas não há perfil vinculado a este usuário. Contate o suporte."
              : "Login efetuado, mas não conseguimos carregar seu perfil. Tente novamente.",
        };
      }
      const profile = res.profile;
      // Clear the expiry signal synchronously on an explicit login so a re-login
      // right after a confirmed ghost session can't be bounced back to /auth/login
      // by AuthSessionGuard reading a stale `true` before onAuthStateChange→apply
      // commits the reset.
      setSessionExpired(false);
      setMfaPending(false);
      setCurrentUser(profile);
      writeAuthSyncMirror({
        id: profile.id,
        role: profile.role,
        roleKey: profile.roleKey,
        sellerId: profile.sellerId ?? null,
      });
      return { ok: true, profile };
    },
    [],
  );

  const signInWithPassword = useCallback(
    async (email: string, password: string): Promise<IAuthResult> => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error || !data.user) {
        return { ok: false, error: translateAuthError(error?.message ?? "") };
      }
      // Optional two-factor: the password was accepted and a session now exists,
      // but it is aal1. Hand the caller back to collect the code — the user is
      // NOT signed in until completeMfaChallenge succeeds.
      if ((await readMfaGate()) === "challenge_required") {
        setMfaPending(true);
        setCurrentUser(null);
        writeAuthSyncMirror(null);
        return { ok: false, mfaRequired: true };
      }
      return finalizeSignIn(supabase, data.user);
    },
    [finalizeSignIn],
  );

  const completeMfaChallenge = useCallback(
    async (code: string): Promise<IAuthResult> => {
      const supabase = getSupabaseClient();
      const factor = await getVerifiedTotpFactor();
      if (!factor) {
        return { ok: false, error: "Nenhuma verificação em duas etapas ativa nesta conta." };
      }
      try {
        await verifyTotpChallenge(factor.id, code);
      } catch (err) {
        // Keep mfaRequired so the caller stays on the code step and can retry.
        return {
          ok: false,
          mfaRequired: true,
          error: err instanceof Error ? err.message : "Código inválido.",
        };
      }
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        return { ok: false, error: "Sua sessão expirou. Entre novamente." };
      }
      return finalizeSignIn(supabase, data.user);
    },
    [finalizeSignIn],
  );

  const cancelMfaChallenge = useCallback(() => {
    // Drop the half-authenticated (aal1) session rather than leaving it around.
    void getSupabaseClient().auth.signOut({ scope: "local" });
    writeAuthSyncMirror(null);
    setMfaPending(false);
    setCurrentUser(null);
  }, []);

  const signOut = useCallback(() => {
    // scope: "local" revokes only THIS device's session. The default (global)
    // revoked every device, so the idle-timeout firing on one device/tab killed
    // the session everywhere and stranded the others with a ghost token.
    void getSupabaseClient().auth.signOut({ scope: "local" });
    writeAuthSyncMirror(null);
    setMfaPending(false);
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
      sessionExpired,
      signIn,
      signInWithPassword,
      mfaPending,
      completeMfaChallenge,
      cancelMfaChallenge,
      signOut,
      hasRole,
    }),
    [
      currentUser,
      isHydrating,
      sessionExpired,
      signIn,
      signInWithPassword,
      mfaPending,
      completeMfaChallenge,
      cancelMfaChallenge,
      signOut,
      hasRole,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
