/**
 * Shared Melhor Envio helpers for the `melhor-envio-quote` and
 * `melhor-envio-oauth` Edge Functions (Épico "Melhor Envio" · Fase A).
 *
 * Holds the base URLs, the Vault secret names (the OAuth token triple is
 * auto-managed here and never appears in the platform's key catalog), the
 * token request/persist helpers and the response normalizer.
 *
 * The canonical price/markup/selection logic lives in the FRONT engine
 * (`src/features/shipping/engine/quoteEngine.ts`); this module only mirrors the
 * server-side row filtering that must happen before the payload leaves the Edge.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";

export const ME_BASE = {
  sandbox: "https://sandbox.melhorenvio.com.br",
  production: "https://www.melhorenvio.com.br",
} as const;

export type MeEnvironment = keyof typeof ME_BASE;

export interface MeSecretNames {
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  userAgent: string;
}

/**
 * Vault secret names, resolved per environment so sandbox and production can be
 * configured and connected independently (flipping the "Ambiente" toggle just
 * switches apps). The OAuth app identity (client_id/secret) and the auto-managed
 * token triple are env-scoped — sandbox carries the `MELHOR_ENVIO_SANDBOX_`
 * prefix, production keeps the bare `MELHOR_ENVIO_` names. The redirect URI and
 * the User-Agent contact are shared (identical for both apps). The token triple
 * is written by the OAuth Edge, never by the key catalog.
 */
export function meSecrets(env: MeEnvironment): MeSecretNames {
  const prefix = env === "production" ? "MELHOR_ENVIO_" : "MELHOR_ENVIO_SANDBOX_";
  return {
    accessToken: `${prefix}ACCESS_TOKEN`,
    refreshToken: `${prefix}REFRESH_TOKEN`,
    tokenExpiresAt: `${prefix}TOKEN_EXPIRES_AT`,
    clientId: `${prefix}CLIENT_ID`,
    clientSecret: `${prefix}CLIENT_SECRET`,
    redirectUri: "MELHOR_ENVIO_REDIRECT_URI",
    userAgent: "MELHOR_ENVIO_USER_AGENT",
  };
}

/** Mandatory by the ME API — overridable via the MELHOR_ENVIO_USER_AGENT secret. */
export const DEFAULT_USER_AGENT = "GALLO BASE DIESEL (contato@gallobasediesel.com.br)";

/** Default OAuth scope set for the whole épico (avoids re-consent on Fases B/C). */
export const ME_DEFAULT_SCOPE =
  "shipping-calculate cart-read cart-write shipping-checkout shipping-generate shipping-print shipping-tracking";

export function meBaseUrl(env: string | undefined | null): string {
  return env === "production" ? ME_BASE.production : ME_BASE.sandbox;
}

export interface MeTokenResponse {
  token_type: string;
  expires_in: number;
  access_token: string;
  refresh_token: string;
}

/**
 * Exchanges an authorization code or a refresh token for a fresh token pair.
 * Throws on a non-2xx response or a body without `access_token`.
 */
export async function requestMeToken(
  base: string,
  payload: Record<string, string>,
  userAgent: string,
): Promise<MeTokenResponse> {
  const res = await fetch(`${base}/oauth/token`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": userAgent,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  });
  const data = await res.json().catch(() => null);
  // Validate the full shape — a 2xx with a missing field would otherwise make
  // persistMeTokens compute `new Date(NaN)` (RangeError) or store an empty token.
  if (
    !res.ok ||
    !data ||
    typeof data.access_token !== "string" ||
    data.access_token.length === 0 ||
    typeof data.refresh_token !== "string" ||
    data.refresh_token.length === 0 ||
    !Number.isFinite(data.expires_in)
  ) {
    throw new Error(`token request failed (${res.status})`);
  }
  return data as MeTokenResponse;
}

/**
 * Persists the auto-managed token triple in the Vault (overwrites in place).
 * `secrets` carries the env-scoped names so sandbox and production tokens never
 * clobber each other.
 */
export async function persistMeTokens(
  admin: SupabaseClient,
  tokens: MeTokenResponse,
  secrets: MeSecretNames,
): Promise<void> {
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  const writes: Array<{ name: string; value: string; description: string }> = [
    { name: secrets.accessToken, value: tokens.access_token, description: "Melhor Envio OAuth access token (auto-managed)" },
    { name: secrets.refreshToken, value: tokens.refresh_token, description: "Melhor Envio OAuth refresh token (auto-managed)" },
    { name: secrets.tokenExpiresAt, value: expiresAt, description: "Melhor Envio token expiry ISO (auto-managed)" },
  ];
  // Check each RPC — Supabase returns { error } (does not throw). A silent
  // partial write would leave stale tokens and trigger repeated refreshes.
  for (const w of writes) {
    const { error } = await admin.rpc("integration_secret_set", {
      p_name: w.name,
      p_value: w.value,
      p_description: w.description,
    });
    if (error) throw new Error(`failed to persist ${w.name}: ${error.message}`);
  }
}

/** Removes the auto-managed token triple for one environment (OAuth disconnect). */
export async function clearMeTokens(admin: SupabaseClient, secrets: MeSecretNames): Promise<void> {
  for (const name of [secrets.accessToken, secrets.refreshToken, secrets.tokenExpiresAt]) {
    const { error } = await admin.rpc("integration_secret_delete", { p_name: name });
    if (error) throw new Error(`failed to delete ${name}: ${error.message}`);
  }
}

/** Clean carrier option as sent to the front (structurally = IShippingQuoteOption). */
export interface MeQuoteOption {
  serviceId: number;
  serviceName: string;
  companyId: number;
  companyName: string;
  companyPicture?: string;
  basePrice: number;
  finalPrice: number;
  deliveryDays: number;
  deliveryRange?: { min: number; max: number };
}

interface MeRawRow {
  id?: number;
  name?: string;
  price?: string | number;
  custom_price?: string | number;
  delivery_time?: number;
  delivery_range?: { min?: number; max?: number };
  company?: { id?: number; name?: string; picture?: string };
  error?: string | null;
}

/**
 * Normalizes the ME `calculate` response: drops rows with an `error` or no
 * usable price, optionally filters by the allowed `services`, and maps the
 * remainder to `MeQuoteOption`. `finalPrice` starts equal to `basePrice`;
 * the front engine applies the markup.
 */
export function normalizeMeOptions(rows: unknown, services?: number[]): MeQuoteOption[] {
  if (!Array.isArray(rows)) return [];
  const allow = services && services.length > 0 ? new Set(services) : null;
  const options: MeQuoteOption[] = [];
  for (const raw of rows as MeRawRow[]) {
    if (!raw || raw.error) continue;
    const id = Number(raw.id);
    if (!Number.isFinite(id)) continue;
    if (allow && !allow.has(id)) continue;
    const price = Number(raw.price ?? raw.custom_price);
    if (!Number.isFinite(price) || price <= 0) continue;
    const range = raw.delivery_range;
    options.push({
      serviceId: id,
      serviceName: String(raw.name ?? `Serviço ${id}`),
      companyId: Number(raw.company?.id ?? 0),
      companyName: String(raw.company?.name ?? ""),
      companyPicture: raw.company?.picture,
      basePrice: price,
      finalPrice: price,
      deliveryDays: Number(raw.delivery_time ?? 0),
      deliveryRange:
        range && range.min != null && range.max != null
          ? { min: Number(range.min), max: Number(range.max) }
          : undefined,
    });
  }
  return options;
}
