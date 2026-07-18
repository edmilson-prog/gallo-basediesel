import { HttpError } from "../_shared/http.ts";

// NOTE: mirrors supabase/functions/waha-connect/wahaServer.ts's
// resolveWahaServerForPing shape (baseUrl+apiKey only, no HMAC — this edge
// never touches webhooks). Kept per-edge to match the existing goServer.ts /
// import-history wahaServer.ts convention — there is no _shared/wahaServer yet.

interface AccountLike {
  id: string;
  waha_server_id: string | null;
}

// deno-lint-ignore no-explicit-any
type Admin = { from: (t: string) => any };
type ResolveSecret = (name: string) => Promise<string | undefined>;

export interface IResolvedWahaServer {
  baseUrl: string;
  apiKey: string;
}

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
    .select("base_url, api_key_ref")
    .eq("id", account.waha_server_id)
    .maybeSingle();
  if (error || !server) {
    throw new HttpError(422, "Servidor WAHA não encontrado para esta conta.");
  }
  const baseUrl = String(server.base_url ?? "").replace(/\/+$/, "");
  if (!baseUrl) throw new HttpError(422, "Servidor WAHA sem endpoint.");
  const apiKey = await resolveSecret(String(server.api_key_ref ?? ""));
  if (!apiKey) throw new HttpError(422, "Chave da API do servidor WAHA não definida.");
  return { baseUrl, apiKey };
}
