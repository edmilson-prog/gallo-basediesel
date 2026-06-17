/**
 * whatsapp-check-number — does a phone number have a WhatsApp account?
 *
 * POST { accountId, phone } where `phone` is wire digits (55DDD…, 12–13).
 *   → { exists, canonicalPhone, traceId }
 *
 * Evolution-only: the Meta Cloud API has no reliable pre-check (the client falls
 * back to the reactive 131026 flow for Meta accounts / offline instances). The
 * api key is resolved Vault-first and never reaches the browser.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";
import { requireCaller } from "../_shared/auth.ts";
import { HttpError, json, parseJsonBody } from "../_shared/http.ts";
import { createSecretResolver } from "../_shared/secrets.ts";
import { servePost } from "../_shared/serve.ts";
import {
  checkWhatsAppNumbers,
  type IEvolutionInstanceTarget,
} from "../_shared/whatsapp/evolution/instance.ts";
import type { IEngineDeps, IIntegrationLogEntry } from "../_shared/whatsapp/types.ts";

/** Starting a conversation is a seller action — broader than staff-only. */
const CHECK_ROLES = ["owner", "manager", "seller_internal", "seller_external"] as const;

const DIGITS = /\D/g;

interface IAccountRow {
  id: string;
  store_id: string;
  provider: string;
  status: string;
  credentials_ref: string;
  provider_config: { baseUrl?: string; instanceName?: string } | null;
}

function jsonError(message: string, code: string, status: number): Response {
  return json({ error: message, code }, status);
}

function makeEngineDeps(admin: SupabaseClient, traceId: string): IEngineDeps {
  return {
    resolveSecret: createSecretResolver(admin),
    logIntegration: async (entry: IIntegrationLogEntry) => {
      await admin.from("integration_logs").insert({
        integration_name: entry.integrationName,
        direction: entry.direction,
        endpoint: entry.endpoint,
        http_status: entry.httpStatus,
        latency_ms: entry.latencyMs,
        trace_id: entry.traceId ?? traceId,
        request_payload: entry.requestPayload,
        response_payload: entry.responsePayload,
        error_message: entry.errorMessage,
      });
    },
  };
}

servePost(async (req, { traceId }) => {
  const body = await parseJsonBody(req);
  const accountId = typeof body.accountId === "string" ? body.accountId : "";
  const phone = (typeof body.phone === "string" ? body.phone : "").replace(DIGITS, "");
  if (!accountId) throw new HttpError(400, "accountId is required");
  if (phone.length < 12 || phone.length > 13) {
    return jsonError("telefone inválido — informe DDI + DDD + número", "VALIDATION_ERROR", 422);
  }

  const { admin, profile } = await requireCaller(req, CHECK_ROLES);

  const { data: account } = await admin
    .from("whatsapp_accounts")
    .select("id, store_id, provider, status, credentials_ref, provider_config")
    .eq("id", accountId)
    .eq("store_id", profile.store_id)
    .maybeSingle<IAccountRow>();
  if (!account) return jsonError("conta não encontrada nesta loja", "NOT_FOUND", 404);
  if (account.provider !== "evolution") {
    return jsonError("validação disponível apenas para contas Evolution", "UNSUPPORTED_PROVIDER", 422);
  }
  if (account.status !== "connected") {
    return jsonError("instância desconectada — não foi possível validar", "INSTANCE_OFFLINE", 409);
  }
  const baseUrl = account.provider_config?.baseUrl;
  const instanceName = account.provider_config?.instanceName;
  if (!baseUrl || !instanceName) {
    return jsonError("configure URL base e instância", "CONFIG_MISSING", 422);
  }

  const deps = makeEngineDeps(admin, traceId);
  const apiKey = await deps.resolveSecret(`${account.credentials_ref}_API_KEY`);
  if (!apiKey) return jsonError("chave de API não cadastrada", "MISSING_API_KEY", 422);

  const target: IEvolutionInstanceTarget = { baseUrl, instanceName };
  const [result] = await checkWhatsAppNumbers(apiKey, deps, target, [phone], traceId);
  const exists = result?.exists === true;
  const canonicalPhone = exists && result?.e164 ? result.e164.replace(DIGITS, "") : null;

  return json({ exists, canonicalPhone, traceId }, 200);
});
