import { HttpError } from "../_shared/http.ts";

interface AccountLike {
  id: string;
  openwa_server_id: string | null;
  provider_config: Record<string, unknown> | null;
}

// deno-lint-ignore no-explicit-any
type Admin = { from: (t: string) => any };
type ResolveSecret = (name: string) => Promise<string | null>;

/**
 * Resolves the OpenWA server's endpoint + global key for an account. Mirrors
 * `goServer.ts` exactly: base_url and the Vault api_key_ref live on
 * `whatsapp_openwa_servers` (registry), NOT on the account. Unlike Go, OpenWA
 * has no separate per-instance token — this SAME global key also authorizes
 * every messaging call (see OpenWaProvider). Service_role bypasses RLS.
 */
export async function resolveOpenWaServer(
  admin: Admin,
  resolveSecret: ResolveSecret,
  account: AccountLike,
): Promise<{ baseUrl: string; globalKey: string }> {
  if (!account.openwa_server_id) {
    throw new HttpError(422, "Conta OpenWA sem servidor configurado (openwa_server_id ausente).");
  }
  const { data: server, error } = await admin
    .from("whatsapp_openwa_servers")
    .select("base_url, api_key_ref")
    .eq("id", account.openwa_server_id)
    .maybeSingle();
  if (error || !server) {
    throw new HttpError(422, "Servidor OpenWA não encontrado para esta conta.");
  }
  const baseUrl = String(server.base_url ?? "").replace(/\/+$/, "");
  if (!baseUrl) throw new HttpError(422, "Servidor OpenWA sem endpoint.");
  const globalKey = await resolveSecret(String(server.api_key_ref ?? ""));
  if (!globalKey) throw new HttpError(422, "Chave global do servidor OpenWA não definida.");
  return { baseUrl, globalKey };
}
