import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * integration-secrets — Owner-only management of third-party API keys
 * (feature "Integrações & Chaves").
 *
 * The platform screen at /app/configuracoes/chaves writes keys here; values
 * are stored ENCRYPTED in Supabase Vault through the service_role-only RPCs
 * `integration_secret_set` / `integration_secrets_status`. Two hard rules:
 *
 *  1. WRITE-ONLY — a secret value is never echoed back to any client. The
 *     `list` action returns only name, description, updatedAt and a 4-char
 *     hint for recognition.
 *  2. AUDITED — every write lands in audit_logs (without the value).
 *
 * Runtime consumers (whatsapp-send, whatsapp-webhook, invite-seller-email)
 * resolve secrets Vault-first with env fallback — see _shared/secrets.ts.
 *
 * Shared lifecycle/auth/error patterns: supabase/functions/_shared (PRD-102).
 */

import { bestEffortAudit } from "../_shared/audit.ts";
import { requireCaller } from "../_shared/auth.ts";
import { HttpError, json, parseJsonBody } from "../_shared/http.ts";
import { servePost } from "../_shared/serve.ts";

const NAME_PATTERN = /^[A-Z][A-Z0-9_]{2,64}$/;
const MAX_VALUE_LENGTH = 8192;

servePost(async (req, { log }) => {
  // Managing API keys is the most privilege-sensitive surface: owner-only.
  const { admin, profile } = await requireCaller(req, ["owner"]);

  const body = await parseJsonBody(req);
  const action = String(body.action ?? "");

  if (action === "list") {
    const { data, error } = await admin.rpc("integration_secrets_status");
    if (error) throw new HttpError(500, `could not list secrets: ${error.message}`);
    return json({ secrets: data ?? [] }, 200);
  }

  if (action === "set") {
    const name = String(body.name ?? "");
    const rawValue = typeof body.value === "string" ? body.value : "";
    const value = rawValue.trim();
    const description = typeof body.description === "string" ? body.description : null;

    if (!NAME_PATTERN.test(name)) throw new HttpError(400, "invalid secret name");
    if (!value || value.length > MAX_VALUE_LENGTH) {
      throw new HttpError(400, "invalid secret value");
    }

    const { error } = await admin.rpc("integration_secret_set", {
      p_name: name,
      p_value: value,
      p_description: description,
    });
    if (error) throw new HttpError(400, `could not save secret: ${error.message}`);

    // Audit the rotation — the value itself never leaves the Vault.
    await bestEffortAudit(admin, {
      store_id: profile.store_id,
      actor_id: profile.seller_id,
      action: "integration_secret_set",
      resource: "integration_secret",
      resource_id: name,
      after: { hint: value.slice(-4) },
    });

    log.info("integration secret saved", { name });
    return json({ ok: true, name }, 200);
  }

  throw new HttpError(400, "invalid action");
});
