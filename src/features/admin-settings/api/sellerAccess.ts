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
 * Seller ids that already have a platform access profile. Empty in mock auth
 * mode (no Supabase session). Requires the caller to be staff.
 */
export async function listSellersWithAccess(storeId: string): Promise<Set<string>> {
  if (AUTH_SOURCE !== "supabase") return new Set();
  const { data, error } = await getSupabaseClient()
    .from("profiles")
    .select("seller_id")
    .eq("store_id", storeId)
    .not("seller_id", "is", null);
  if (error) throw new Error(`Não foi possível carregar os acessos: ${error.message}`);
  return new Set((data ?? []).map((row) => (row as { seller_id: string }).seller_id));
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
