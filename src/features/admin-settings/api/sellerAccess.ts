import { getSupabaseClient } from "@/shared/lib/supabase";
import { AUTH_SOURCE } from "@/features/auth/authSource";

/**
 * Client surface for the user-access management (PRD-107 Fase 3). Reads access
 * status (role + last login) via the staff-scoped RPC `seller_access_info`
 * (SECURITY DEFINER — joins auth.users server-side) and creates/manages access
 * through the `invite-seller` Edge Function — the service_role key never
 * reaches the browser.
 */

export type InviteSellerRole = "seller_internal" | "seller_external" | "manager";

export interface IInviteSellerInput {
  sellerId: string;
  email: string;
  password: string;
  role: InviteSellerRole;
}

export interface IInviteSellerResult {
  userId: string;
  sellerId: string;
  email: string;
  role: string;
}

export interface ISellerAccessInfo {
  role: string;
  /** Last Supabase sign-in (null = invited but never logged in). */
  lastSignInAt: string | null;
}

/**
 * Maps `sellerId → access info` (role + last login) for every seller with a
 * platform profile, via the staff-scoped RPC `seller_access_info`. Empty in
 * mock auth mode.
 */
export async function listSellerAccessInfo(): Promise<Map<string, ISellerAccessInfo>> {
  if (AUTH_SOURCE !== "supabase") return new Map();
  const { data, error } = await getSupabaseClient().rpc("seller_access_info");
  if (error) throw new Error(`Não foi possível carregar os acessos: ${error.message}`);
  const map = new Map<string, ISellerAccessInfo>();
  for (const row of data ?? []) {
    const r = row as { seller_id: string; role: string; last_sign_in_at: string | null };
    map.set(r.seller_id, { role: r.role, lastSignInAt: r.last_sign_in_at });
  }
  return map;
}

/** Invokes `invite-seller` (creates the auth user + links the profile). */
export async function inviteSeller(input: IInviteSellerInput): Promise<IInviteSellerResult> {
  const { data, error } = await getSupabaseClient().functions.invoke<IInviteSellerResult>(
    "invite-seller",
    { body: input },
  );
  if (error) throw new Error(await extractFunctionError(error));
  if (!data) throw new Error("Resposta vazia do servidor.");
  return data;
}

export interface IInviteSellerEmailResult {
  /** true when the email actually went out (Resend configured). */
  sent?: boolean;
  /** true when the function ran in inert scaffold mode (no Resend key yet). */
  scaffold?: boolean;
  note?: string;
  userId?: string;
  sellerId?: string;
  email?: string;
  role?: string;
}

/**
 * Invokes `invite-seller-email`: creates the auth user via an invite action
 * link and emails it through Resend so the seller sets their own password at
 * /auth/definir-senha. While `RESEND_API_KEY` is not configured (issue #46) the
 * function is INERT — it validates the request, mutates nothing and returns
 * `scaffold: true`; the UI surfaces that as "not activated yet".
 */
export async function inviteSellerByEmail(
  input: Omit<IInviteSellerInput, "password">,
): Promise<IInviteSellerEmailResult> {
  const { data, error } = await getSupabaseClient().functions.invoke<IInviteSellerEmailResult>(
    "invite-seller-email",
    { body: input },
  );
  if (error) throw new Error(await extractFunctionError(error));
  if (!data) throw new Error("Resposta vazia do servidor.");
  return data;
}

/** Turns a seller's platform login on/off via the `set-seller-access` function. */
export async function setSellerAccess(sellerId: string, active: boolean): Promise<void> {
  const { error } = await getSupabaseClient().functions.invoke("set-seller-access", {
    body: { sellerId, active },
  });
  if (error) throw new Error(await extractFunctionError(error));
}

/**
 * Sets a fresh temporary password for a seller who lost theirs, via the
 * `reset-seller-password` function. The new password is generated on the client
 * (so it can be shown for hand-off) and only applied server-side.
 */
export async function resetSellerPassword(sellerId: string, password: string): Promise<void> {
  const { error } = await getSupabaseClient().functions.invoke("reset-seller-password", {
    body: { sellerId, password },
  });
  if (error) throw new Error(await extractFunctionError(error));
}

/**
 * Changes a seller's platform access role (profiles.role) via the
 * `set-seller-role` function. Owner-only on the server; the new role only
 * reaches the seller's session on their next token refresh.
 */
export async function setSellerRole(sellerId: string, role: InviteSellerRole): Promise<void> {
  const { error } = await getSupabaseClient().functions.invoke("set-seller-role", {
    body: { sellerId, role },
  });
  if (error) throw new Error(await extractFunctionError(error));
}

/** Pulls the JSON `error` field out of a non-2xx Edge Function response. */
async function extractFunctionError(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response }).context;
  if (ctx && typeof ctx.json === "function") {
    try {
      const body = (await ctx.json()) as { error?: string };
      if (body?.error) return body.error;
    } catch {
      /* fall through to the generic message */
    }
  }
  return error instanceof Error ? error.message : "Falha ao criar o acesso.";
}

/** Readable 14-char temp password (no ambiguous chars) + a symbol/digit suffix. */
export function generateTempPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = new Uint32Array(14);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += alphabet.charAt(b % alphabet.length);
  return `${out}@9`;
}
