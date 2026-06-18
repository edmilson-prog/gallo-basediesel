import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * melhor-envio-quote — server-side shipping quote (Épico "Melhor Envio" · Fase A).
 *
 * Authenticated POST: any profiled seller/staff may quote. Resolves the OAuth
 * access token Vault-first, refreshes it proactively (past stored expiry) and
 * reactively (on a 401), calls ME `POST /api/v2/me/shipment/calculate` in
 * `package` mode, normalizes the response and returns `{ options }`.
 *
 * Inert mode: with no access token in the Vault, returns `{ scaffold: true }`
 * so the front treats the integration as "not connected" and falls back to the
 * PRD-033 region rules. A provider/transport error returns `{ options: [] }`
 * (also a fall-back signal) — the quote never throws back to the seller.
 *
 * Input: { originZip, destZip, box:{heightCm,widthCm,lengthCm}, weightKg,
 *          declaredValue, environment, services? }
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";
import { requireCaller } from "../_shared/auth.ts";
import { HttpError, json, parseJsonBody } from "../_shared/http.ts";
import { createSecretResolver, type VaultSecretResolver } from "../_shared/secrets.ts";
import { servePost } from "../_shared/serve.ts";
import type { Logger } from "../_shared/logger.ts";
import {
  DEFAULT_USER_AGENT,
  type MeSecretNames,
  meBaseUrl,
  meSecrets,
  normalizeMeOptions,
  persistMeTokens,
  requestMeToken,
} from "../_shared/melhorEnvio.ts";

/** Quoting is a seller action (broader than staff-only). RLS still governs data. */
const QUOTE_ROLES = ["owner", "manager", "seller_internal", "seller_external"] as const;

const NON_DIGITS = /\D/g;

interface QuoteBody {
  originZip?: string;
  destZip?: string;
  box?: { heightCm?: number; widthCm?: number; lengthCm?: number };
  weightKg?: number;
  declaredValue?: number;
  environment?: string;
  services?: number[];
}

/** Refreshes the access token from the refresh token; returns the new one or null. */
async function refreshAccessToken(
  admin: SupabaseClient,
  resolveSecret: VaultSecretResolver,
  base: string,
  userAgent: string,
  log: Logger,
  secrets: MeSecretNames,
): Promise<string | null> {
  const [refreshToken, clientId, clientSecret] = await Promise.all([
    resolveSecret(secrets.refreshToken),
    resolveSecret(secrets.clientId),
    resolveSecret(secrets.clientSecret),
  ]);
  if (!refreshToken || !clientId || !clientSecret) return null;
  try {
    const tokens = await requestMeToken(
      base,
      {
        grant_type: "refresh_token",
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
      },
      userAgent,
    );
    await persistMeTokens(admin, tokens, secrets);
    log.info("melhor envio token refreshed");
    return tokens.access_token;
  } catch (err) {
    log.error("melhor envio refresh failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

servePost(async (req, { log, traceId }) => {
  const { admin } = await requireCaller(req, QUOTE_ROLES);
  const resolveSecret = createSecretResolver(admin);

  const body = (await parseJsonBody(req)) as QuoteBody;
  const originZip = (body.originZip ?? "").replace(NON_DIGITS, "");
  const destZip = (body.destZip ?? "").replace(NON_DIGITS, "");
  if (originZip.length !== 8 || destZip.length !== 8) {
    throw new HttpError(400, "originZip and destZip must be 8-digit CEPs");
  }

  const env = body.environment === "production" ? "production" : "sandbox";
  const base = meBaseUrl(env);
  const secrets = meSecrets(env);

  let accessToken = await resolveSecret(secrets.accessToken);
  // Inert mode: not connected → the hook falls back to region rules.
  if (!accessToken) return json({ scaffold: true }, 200);

  const userAgent = (await resolveSecret(secrets.userAgent)) || DEFAULT_USER_AGENT;

  const box = body.box ?? {};
  const services = Array.isArray(body.services)
    ? body.services.filter((n) => Number.isFinite(n))
    : [];
  const calcBody = {
    from: { postal_code: originZip },
    to: { postal_code: destZip },
    package: {
      height: Math.max(1, Number(box.heightCm ?? 0)),
      width: Math.max(1, Number(box.widthCm ?? 0)),
      length: Math.max(1, Number(box.lengthCm ?? 0)),
      weight: Math.max(0.1, Number(body.weightKg ?? 0)),
    },
    options: {
      insurance_value: Math.max(0, Number(body.declaredValue ?? 0)),
      receipt: false,
      own_hand: false,
    },
    ...(services.length > 0 ? { services: services.join(",") } : {}),
  };

  // Proactive refresh when the stored expiry is within 60s (jitter buffer
  // avoids clock-skew thrashing on the boundary).
  const expiresAtRaw = await resolveSecret(secrets.tokenExpiresAt);
  const expiresAt = expiresAtRaw ? Date.parse(expiresAtRaw) : Number.NaN;
  if (Number.isFinite(expiresAt) && expiresAt <= Date.now() + 60_000) {
    accessToken = (await refreshAccessToken(admin, resolveSecret, base, userAgent, log, secrets)) ?? accessToken;
  }

  const callCalculate = (token: string): Promise<Response> =>
    fetch(`${base}/api/v2/me/shipment/calculate`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": userAgent,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(calcBody),
      signal: AbortSignal.timeout(15_000),
    });

  const startedAt = Date.now();
  let res: Response;
  try {
    res = await callCalculate(accessToken);
    // Reactive refresh on 401 → retry once.
    if (res.status === 401) {
      const refreshed = await refreshAccessToken(admin, resolveSecret, base, userAgent, log, secrets);
      if (refreshed) {
        accessToken = refreshed;
        res = await callCalculate(accessToken);
      }
    }
  } catch (err) {
    // Timeout / network / transport error → soft fallback to region rules.
    log.warn("melhor envio calculate unreachable", {
      error: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - startedAt,
    });
    return json({ options: [], error: "provider_unreachable" }, 200);
  }

  const latencyMs = Date.now() - startedAt;
  const payload = await res.json().catch(() => null);

  // Best-effort audit (no PII beyond CEPs / sizes).
  admin
    .from("integration_logs")
    .insert({
      integration_name: "melhor_envio",
      direction: "outbound",
      endpoint: "/api/v2/me/shipment/calculate",
      http_status: res.status,
      latency_ms: latencyMs,
      trace_id: traceId,
      request_payload: { from: originZip, to: destZip, env },
      response_payload: res.ok
        ? { count: Array.isArray(payload) ? payload.length : 0 }
        : payload,
      error_message: res.ok ? null : `calculate failed (${res.status})`,
    })
    .then(undefined, () => {
      /* auditing must never break the quote */
    });

  if (!res.ok) {
    log.warn("melhor envio calculate failed", { status: res.status });
    // Soft failure → empty options so the hook falls back to region rules.
    return json({ options: [], error: `provider_error_${res.status}` }, 200);
  }

  const options = normalizeMeOptions(payload, services);
  return json({ options }, 200);
});
