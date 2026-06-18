import { getSupabaseClient } from "@/shared/lib/supabase";

/** Client-side wrapper around the `melhor-envio-oauth` Edge Function (Fase A). */

export type MelhorEnvioEnv = "sandbox" | "production";

export interface IMelhorEnvioStatus {
  connected: boolean;
  /** ISO expiry of the access token, or null when not connected. */
  expiresAt: string | null;
  /** True when client_id + client_secret + redirect_uri are all set in the Vault. */
  hasCredentials: boolean;
}

/** sessionStorage keys carrying the OAuth CSRF state across the redirect. */
export const MELHOR_ENVIO_OAUTH_STATE_KEY = "gallo-me-oauth-state";
export const MELHOR_ENVIO_OAUTH_ENV_KEY = "gallo-me-oauth-env";

async function invokeOAuth<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabaseClient().functions.invoke<T>("melhor-envio-oauth", {
    body,
  });
  if (error) throw error;
  return data as T;
}

export function getMelhorEnvioStatus(environment: MelhorEnvioEnv): Promise<IMelhorEnvioStatus> {
  return invokeOAuth<IMelhorEnvioStatus>({ action: "status", environment });
}

export function getMelhorEnvioAuthorizeUrl(
  environment: MelhorEnvioEnv,
): Promise<{ url: string; state: string }> {
  return invokeOAuth<{ url: string; state: string }>({ action: "authorize-url", environment });
}

export function exchangeMelhorEnvioCode(
  code: string,
  environment: MelhorEnvioEnv,
): Promise<{ connected: boolean }> {
  return invokeOAuth<{ connected: boolean }>({ action: "exchange", code, environment });
}

export function disconnectMelhorEnvio(
  environment: MelhorEnvioEnv,
): Promise<{ connected: boolean }> {
  return invokeOAuth<{ connected: boolean }>({ action: "disconnect", environment });
}
