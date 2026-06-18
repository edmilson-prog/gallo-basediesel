import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * melhor-envio-oauth — Owner-only OAuth2 lifecycle for Melhor Envio (Fase A).
 *
 * Actions (JSON `{ action }`):
 *   - authorize-url → builds the consent URL + CSRF `state` (client stores it).
 *   - exchange      → trades the `code` for tokens, persists them in the Vault.
 *   - status        → connection state + expiry (never returns a token).
 *   - disconnect    → removes the auto-managed token triple from the Vault.
 *
 * Client credentials (CLIENT_ID/SECRET/REDIRECT_URI) are managed from the
 * "Chaves & API" screen; the token triple is auto-managed here. Nothing secret
 * is ever echoed back to the browser.
 */

import { bestEffortAudit } from "../_shared/audit.ts";
import { requireCaller } from "../_shared/auth.ts";
import { HttpError, json, parseJsonBody } from "../_shared/http.ts";
import { createSecretResolver } from "../_shared/secrets.ts";
import { servePost } from "../_shared/serve.ts";
import {
  clearMeTokens,
  DEFAULT_USER_AGENT,
  ME_DEFAULT_SCOPE,
  meBaseUrl,
  meSecrets,
  persistMeTokens,
  requestMeToken,
} from "../_shared/melhorEnvio.ts";

servePost(async (req, { log }) => {
  // OAuth lifecycle is the most privilege-sensitive surface: owner-only.
  const { callerId, admin, profile } = await requireCaller(req, ["owner"]);
  const resolveSecret = createSecretResolver(admin);

  const body = await parseJsonBody(req);
  const action = String(body.action ?? "");
  const env = body.environment === "production" ? "production" : "sandbox";
  const base = meBaseUrl(env);
  const secrets = meSecrets(env);

  if (action === "authorize-url") {
    const [clientId, redirectUri] = await Promise.all([
      resolveSecret(secrets.clientId),
      resolveSecret(secrets.redirectUri),
    ]);
    if (!clientId || !redirectUri) {
      throw new HttpError(400, "missing client_id/redirect_uri — configure them in Chaves & API");
    }
    const scope = typeof body.scope === "string" && body.scope.trim() ? body.scope.trim() : ME_DEFAULT_SCOPE;
    const state = crypto.randomUUID();
    const url =
      `${base}/oauth/authorize?client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code&scope=${encodeURIComponent(scope)}` +
      `&state=${encodeURIComponent(state)}`;
    return json({ url, state }, 200);
  }

  if (action === "exchange") {
    const code = typeof body.code === "string" ? body.code : "";
    if (!code) throw new HttpError(400, "missing authorization code");
    const [clientId, clientSecret, redirectUri, userAgent] = await Promise.all([
      resolveSecret(secrets.clientId),
      resolveSecret(secrets.clientSecret),
      resolveSecret(secrets.redirectUri),
      resolveSecret(secrets.userAgent),
    ]);
    if (!clientId || !clientSecret || !redirectUri) {
      throw new HttpError(400, "missing client credentials — configure them in Chaves & API");
    }
    const tokens = await requestMeToken(
      base,
      {
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code,
      },
      userAgent || DEFAULT_USER_AGENT,
    );
    await persistMeTokens(admin, tokens, secrets);
    await bestEffortAudit(admin, {
      store_id: profile.store_id,
      actor_id: callerId,
      action: "melhor_envio_connected",
      resource: "shipping_integration",
      resource_id: "melhor_envio",
      after: { environment: env },
    });
    log.info("melhor envio connected", { environment: env });
    return json({ connected: true }, 200);
  }

  if (action === "status") {
    const [accessToken, expiresAt, clientId, clientSecret, redirectUri] = await Promise.all([
      resolveSecret(secrets.accessToken),
      resolveSecret(secrets.tokenExpiresAt),
      resolveSecret(secrets.clientId),
      resolveSecret(secrets.clientSecret),
      resolveSecret(secrets.redirectUri),
    ]);
    return json(
      {
        connected: Boolean(accessToken),
        expiresAt: expiresAt ?? null,
        hasCredentials: Boolean(clientId && clientSecret && redirectUri),
      },
      200,
    );
  }

  if (action === "disconnect") {
    await clearMeTokens(admin, secrets);
    await bestEffortAudit(admin, {
      store_id: profile.store_id,
      actor_id: callerId,
      action: "melhor_envio_disconnected",
      resource: "shipping_integration",
      resource_id: "melhor_envio",
      after: { environment: env },
    });
    log.info("melhor envio disconnected", { environment: env });
    return json({ connected: false }, 200);
  }

  throw new HttpError(400, "invalid action");
});
