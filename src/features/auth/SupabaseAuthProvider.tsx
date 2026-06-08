import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { RoleName } from "@/shared/types";
import { getSupabaseClient } from "@/shared/lib/supabase";
import { AuthContext, type IAuthContextValue, type IAuthResult } from "./authContext";
import type { IUserProfile } from "./mock-users";
import { writeAuthSyncMirror } from "./authSession";
import { defaultRedirectForRole, mapDbRoleToRoleName, roleGroup } from "./roleMap";

/** Row shape of `public.profiles` (PRD-107 slice). */
interface ProfileRow {
  auth_user_id: string;
  seller_id: string | null;
  store_id: string;
  role: string;
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
 * Resolves the profile for an authenticated user from the `profiles` table.
 *
 * The slice queries the table directly (RLS: select-self). Once the Custom
 * Access Token Hook (PRD-107) is enabled and RLS (PRD-103) lands, this can read
 * the claims straight off `user.app_metadata` and skip the round-trip.
 */
async function resolveProfile(supabase: SupabaseClient, user: User): Promise<IUserProfile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("auth_user_id, seller_id, store_id, role, display_name, email")
    .eq("auth_user_id", user.id)
    .single();
  if (error || !data) return null;
  return buildProfile(data as ProfileRow, user);
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

  useEffect(() => {
    const supabase = getSupabaseClient();
    let active = true;

    const apply = async (user: User | null | undefined) => {
      if (!user) {
        if (active) {
          setCurrentUser(null);
          writeAuthSyncMirror(null);
        }
        return;
      }
      const profile = await resolveProfile(supabase, user);
      if (!active) return;
      setCurrentUser(profile);
      writeAuthSyncMirror(profile ? { id: profile.id, role: profile.role } : null);
    };

    supabase.auth
      .getSession()
      .then(({ data }) => apply(data.session?.user))
      .finally(() => {
        if (active) setIsHydrating(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      void apply(session?.user);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Pick-a-profile sign-in is mock-only; no-op here so the contract is honoured.
  const signIn = useCallback((): IUserProfile | null => null, []);

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
      const profile = await resolveProfile(supabase, data.user);
      if (!profile) {
        return {
          ok: false,
          error: "Login efetuado, mas não há perfil vinculado a este usuário. Contate o suporte.",
        };
      }
      setCurrentUser(profile);
      writeAuthSyncMirror({ id: profile.id, role: profile.role });
      return { ok: true, profile };
    },
    [],
  );

  const signOut = useCallback(() => {
    void getSupabaseClient().auth.signOut();
    writeAuthSyncMirror(null);
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
      signInWithPassword,
      signOut,
      hasRole,
    }),
    [currentUser, isHydrating, signIn, signInWithPassword, signOut, hasRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
