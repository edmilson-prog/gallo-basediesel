import { getSupabaseClient } from "@/shared/lib/supabase";
import { AUTH_SOURCE } from "@/features/auth/authSource";

/**
 * Client surface for the user-access management (PRD-107 Fase 3). Reads access
 * status from `profiles` (staff-only, policy `profiles_select_staff`) and
 * creates access through the `invite-seller` Edge Function — the service_role
 * key never reaches the browser.
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

/**
 * Maps `sellerId → role` for every seller that already has a platform access
 * profile. Empty in mock auth mode (no Supabase session). Requires the caller
 * to be staff (policy `profiles_select_staff`). The role lets the UI hide the
 * deactivate action for Owners.
 */
export async function listSellerAccessRoles(storeId: string): Promise<Map<string, string>> {
  if (AUTH_SOURCE !== "supabase") return new Map();
  const { data, error } = await getSupabaseClient()
    .from("profiles")
    .select("seller_id, role")
    .eq("store_id", storeId)
    .not("seller_id", "is", null);
  if (error) throw new Error(`Não foi possível carregar os acessos: ${error.message}`);
  const map = new Map<string, string>();
  for (const row of data ?? []) {
    const r = row as { seller_id: string; role: string };
    map.set(r.seller_id, r.role);
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

/** Turns a seller's platform login on/off via the `set-seller-access` function. */
export async function setSellerAccess(sellerId: string, active: boolean): Promise<void> {
  const { error } = await getSupabaseClient().functions.invoke("set-seller-access", {
    body: { sellerId, active },
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
