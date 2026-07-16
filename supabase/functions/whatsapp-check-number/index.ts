/**
 * whatsapp-check-number — does a phone number have a WhatsApp account?
 *
 * POST { accountId, phone } where `phone` is wire digits (55DDD…, 12–13).
 *   → { exists, canonicalPhone, traceId }
 *
 * Evolution: no reliable pre-check exists on the Cloud API side (Meta
 * accounts fall back to the reactive 131026 flow). WAHA: has a dedicated
 * `GET /api/contacts/check-exists` endpoint (WAHA docs, "Contacts") — used
 * directly (see docs/superpowers/specs/2026-07-15-waha-ack-and-number-check-design.md).
 * The api key is resolved Vault-first and never reaches the browser.
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
import { checkWahaNumberExists } from "../_shared/whatsapp/waha/contacts.ts";
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
  provider_config: { baseUrl?: string; instanceName?: string; sessionName?: string } | null;
  waha_server_id: string | null;
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

async function checkEvolution(
  admin: SupabaseClient,
  account: IAccountRow,
  phone: string,
  traceId: string,
): Promise<Response> {
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
}

async function checkWaha(
  admin: SupabaseClient,
  account: IAccountRow,
  phone: string,
  traceId: string,
): Promise<Response> {
  const sessionName = account.provider_config?.sessionName;
  if (!sessionName) {
    return jsonError("sessão WAHA sem sessionName configurado", "CONFIG_MISSING", 422);
  }
  if (!account.waha_server_id) {
    return jsonError("conta sem servidor WAHA associado", "CONFIG_MISSING", 422);
  }
  const { data: server } = await admin
    .from("waha_servers")
    .select("base_url, api_key_ref")
    .eq("id", account.waha_server_id)
    .maybeSingle();
  if (!server) return jsonError("servidor WAHA não encontrado", "CONFIG_MISSING", 422);

  const baseUrl = String(server.base_url ?? "").replace(/\/+$/, "");
  const apiKey = await createSecretResolver(admin)(String(server.api_key_ref ?? ""));
  if (!apiKey) {
    return jsonError("chave da API do servidor WAHA não definida", "MISSING_API_KEY", 422);
  }

  const result = await checkWahaNumberExists(
    apiKey,
    globalThis.fetch,
    { baseUrl, sessionName },
    phone,
  );
  const canonicalPhone = result.exists && result.e164 ? result.e164.replace(DIGITS, "") : null;
  return json({ exists: result.exists, canonicalPhone, traceId }, 200);
}

servePost(async (req, { traceId }) => {
  const body = await parseJsonBody(req);
  const accountId = typeof body.accountId === "string" ? body.accountId : "";
  const phone = (typeof body.phone === "string" ? body.phone : "").replace(DIGITS, "");

  const { admin, profile } = await requireCaller(req, CHECK_ROLES);

  if (!accountId) throw new HttpError(400, "accountId is required");
  if (phone.length < 12 || phone.length > 13) {
    return jsonError("telefone inválido — informe DDI + DDD + número", "VALIDATION_ERROR", 422);
  }

  const { data: account } = await admin
    .from("whatsapp_accounts")
    .select("id, store_id, provider, status, credentials_ref, provider_config, waha_server_id")
    .eq("id", accountId)
    .eq("store_id", profile.store_id)
    .maybeSingle<IAccountRow>();
  if (!account) return jsonError("conta não encontrada nesta loja", "NOT_FOUND", 404);
  if (account.provider !== "evolution" && account.provider !== "waha") {
    return jsonError(
      "validação disponível apenas para contas Evolution ou WAHA",
      "UNSUPPORTED_PROVIDER",
      422,
    );
  }
  if (account.status !== "connected") {
    return jsonError("instância desconectada — não foi possível validar", "INSTANCE_OFFLINE", 409);
  }

  return account.provider === "waha"
    ? checkWaha(admin, account, phone, traceId)
    : checkEvolution(admin, account, phone, traceId);
});
