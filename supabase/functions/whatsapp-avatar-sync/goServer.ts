import { HttpError } from "../_shared/http.ts";

// NOTE: mirrors supabase/functions/whatsapp-connect/goServer.ts (whatsapp-send
// inlines the same query). Kept per-edge to match the existing layout — there is
// no _shared/goServer yet. A future refactor could hoist all three into _shared.

interface AccountLike {
  id: string;
  go_server_id: string | null;
  provider_config: Record<string, unknown> | null;
}

// deno-lint-ignore no-explicit-any
type Admin = { from: (t: string) => any };
type ResolveSecret = (name: string) => Promise<string | null>;

/**
 * Resolves the Evolution Go server's endpoint + global key for an account.
 * The base_url and the Vault api_key_ref live on `whatsapp_go_servers`
 * (registry), NOT on the account. The per-instance token stays per-account and
 * is resolved by the caller. Service_role bypasses RLS.
 */
export async function resolveGoServer(
  admin: Admin,
  resolveSecret: ResolveSecret,
  account: AccountLike,
): Promise<{ baseUrl: string; globalKey: string }> {
  if (!account.go_server_id) {
    throw new HttpError(422, "Conta Evolution Go sem servidor configurado (go_server_id ausente).");
  }
  const { data: server, error } = await admin
    .from("whatsapp_go_servers")
    .select("base_url, api_key_ref")
    .eq("id", account.go_server_id)
    .maybeSingle();
  if (error || !server) {
    throw new HttpError(422, "Servidor Evolution Go não encontrado para esta conta.");
  }
  const baseUrl = String(server.base_url ?? "").replace(/\/+$/, "");
  if (!baseUrl) throw new HttpError(422, "Servidor Evolution Go sem endpoint.");
  const globalKey = await resolveSecret(String(server.api_key_ref ?? ""));
  if (!globalKey) throw new HttpError(422, "Chave global do servidor Evolution Go não definida.");
  return { baseUrl, globalKey };
}
