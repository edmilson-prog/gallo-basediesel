import { HttpError } from "../_shared/http.ts";

interface AccountLike {
  id: string;
  waha_server_id: string | null;
}

// deno-lint-ignore no-explicit-any
type Admin = { from: (t: string) => any };
/** Matches _shared/secrets.ts::VaultSecretResolver (Vault miss → undefined, not null). */
type ResolveSecret = (name: string) => Promise<string | undefined>;

export interface IResolvedWahaServer {
  baseUrl: string;
  apiKey: string;
  hmacKey: string;
}

/**
 * Resolves a WAHA account's server endpoint + secrets. base_url/api_key_ref/
 * webhook_hmac_ref live on `waha_servers` (registry), NOT on the account.
 * Service_role bypasses RLS. Requires the webhook HMAC secret to be
 * configured (fail-closed webhooks for every session created going forward).
 */
export async function resolveWahaServer(
  admin: Admin,
  resolveSecret: ResolveSecret,
  account: AccountLike,
): Promise<IResolvedWahaServer> {
  if (!account.waha_server_id) {
    throw new HttpError(422, "Conta WAHA sem servidor configurado (waha_server_id ausente).");
  }
  const { data: server, error } = await admin
    .from("waha_servers")
    .select("base_url, api_key_ref, webhook_hmac_ref")
    .eq("id", account.waha_server_id)
    .maybeSingle();
  if (error || !server) {
    throw new HttpError(422, "Servidor WAHA não encontrado para esta conta.");
  }
  const baseUrl = String(server.base_url ?? "").replace(/\/+$/, "");
  if (!baseUrl) throw new HttpError(422, "Servidor WAHA sem endpoint.");
  const apiKey = await resolveSecret(String(server.api_key_ref ?? ""));
  if (!apiKey) throw new HttpError(422, "Chave da API do servidor WAHA não definida.");
  if (!server.webhook_hmac_ref) {
    throw new HttpError(
      422,
      "Segredo HMAC do webhook WAHA não configurado — defina-o em Configurações → Chaves antes de criar uma sessão.",
    );
  }
  const hmacKey = await resolveSecret(String(server.webhook_hmac_ref));
  if (!hmacKey) throw new HttpError(422, "Segredo HMAC do webhook WAHA não definido no Vault.");
  return { baseUrl, apiKey, hmacKey };
}

/** Resolves just the server row (no secrets) — used when picking the default server on create. */
export async function findSoleWahaServer(admin: Admin): Promise<{ id: string } | null> {
  const { data } = await admin.from("waha_servers").select("id").limit(2);
  const rows = data ?? [];
  return rows.length === 1 ? { id: rows[0].id as string } : null;
}
