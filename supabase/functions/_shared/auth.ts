/**
 * Shared caller identification and authorization for Edge Functions (PRD-102).
 *
 * Every privileged GALLO function follows the same defence-in-depth dance on
 * top of the gateway's verify_jwt:
 *   1. resolve the caller from their JWT (anon client + Authorization header),
 *   2. open a service_role client (bypasses RLS — server-side only),
 *   3. load the caller's profile and check the required role.
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";
import { requiredEnv } from "./env.ts";
import { HttpError } from "./http.ts";

const SUPABASE_URL = requiredEnv("SUPABASE_URL");
const SERVICE_ROLE = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const ANON_KEY = requiredEnv("SUPABASE_ANON_KEY");

export const STAFF_ROLES = ["owner", "manager"] as const;

export interface CallerProfile {
  role: string;
  store_id: string;
}

export interface CallerContext {
  /** The authenticated auth.users id of the caller. */
  callerId: string;
  /** service_role client — bypasses RLS; never expose its key to the browser. */
  admin: SupabaseClient;
  /** The caller's profiles row (role + store). */
  profile: CallerProfile;
}

/**
 * Resolves the caller and their profile, enforcing `allowedRoles`.
 * Throws HttpError(401/403) with the exact messages the clients already handle.
 */
export async function requireCaller(
  req: Request,
  allowedRoles: readonly string[],
): Promise<CallerContext> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new HttpError(401, "missing authorization");

  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: callerData, error: callerErr } = await callerClient.auth.getUser();
  if (callerErr || !callerData?.user) throw new HttpError(401, "invalid session");

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const { data: profile } = await admin
    .from("profiles")
    .select("role, store_id")
    .eq("auth_user_id", callerData.user.id)
    .maybeSingle();

  if (!profile || !allowedRoles.includes(profile.role)) {
    const label = allowedRoles.length === 1 ? allowedRoles[0] : "owner or manager";
    throw new HttpError(403, `forbidden: requires ${label}`);
  }

  return { callerId: callerData.user.id, admin, profile };
}
