/**
 * whatsapp-import-history — owner-only batched import of the Evolution
 * instance's stored chat history (real-inbox spec 2026-06-11).
 *
 * POST { accountId, cursor? } → { done, nextCursor, stats }
 * The client loops until done; the import core dedups by provider_message_id
 * (in-batch Map + DB lookup) and the unique index messages_provider_message_id_key
 * + ignoreDuplicates upsert close the race against the live webhook.
 * Re-running never duplicates and resumes after failures.
 *
 * Secrets: {credentials_ref}_API_KEY (Vault-first, env fallback).
 * Errors: house `{ error, code }` contract (codes mirror whatsapp-connect).
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";
import { bestEffortAudit } from "../_shared/audit.ts";
import { requireCaller } from "../_shared/auth.ts";
import { HttpError, json, parseJsonBody } from "../_shared/http.ts";
import { createSecretResolver } from "../_shared/secrets.ts";
import { servePost } from "../_shared/serve.ts";
import { findChats, findMessages } from "../_shared/whatsapp/evolution/instance.ts";
import { processImportBatch, type IImportSource } from "../_shared/whatsapp/import/core.ts";
import { makeImportDb } from "../_shared/import-db.ts";
import type { IEngineDeps, IIntegrationLogEntry } from "../_shared/whatsapp/types.ts";

interface IAccountRow {
  id: string;
  store_id: string;
  provider: string;
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

/** Audit actor must reference sellers.id (audit FK) — resolve from the caller. */
async function resolveActorSellerId(
  admin: SupabaseClient,
  callerId: string,
): Promise<string | null> {
  const { data } = await admin
    .from("profiles")
    .select("seller_id")
    .eq("auth_user_id", callerId)
    .maybeSingle();
  return (data?.seller_id as string | null) ?? null;
}

servePost(async (req, { log, traceId }) => {
  const { callerId, admin, profile } = await requireCaller(req, ["owner"]);
  const body = await parseJsonBody(req);
  const accountId = typeof body.accountId === "string" ? body.accountId : "";
  const cursor = typeof body.cursor === "number" ? body.cursor : 0;
  if (!accountId) throw new HttpError(400, "accountId is required");

  const { data: account } = await admin
    .from("whatsapp_accounts")
    .select("id, store_id, provider, credentials_ref, provider_config")
    .eq("id", accountId)
    .eq("store_id", profile.store_id)
    .maybeSingle<IAccountRow>();
  if (!account) return jsonError("conta não encontrada nesta loja", "NOT_FOUND", 404);
  if (account.provider !== "evolution") {
    return jsonError("importação disponível apenas para contas Evolution", "VALIDATION_ERROR", 422);
  }
  const baseUrl = account.provider_config?.baseUrl;
  const instanceName = account.provider_config?.instanceName;
  if (!baseUrl || !instanceName) {
    return jsonError("configure URL base e instância antes de importar", "CONFIG_MISSING", 422);
  }

  const deps = makeEngineDeps(admin, traceId);
  const apiKey = await deps.resolveSecret(`${account.credentials_ref}_API_KEY`);
  if (!apiKey) {
    return jsonError("chave de API da instância não cadastrada", "MISSING_API_KEY", 422);
  }

  const target = { baseUrl, instanceName };
  const source: IImportSource = {
    listChats: async () => (await findChats(apiKey, deps, target, traceId)).map((c) => c.remoteJid),
    listMessages: (remoteJid, page) => findMessages(apiKey, deps, target, remoteJid, page, traceId),
  };

  const result = await processImportBatch({
    account: { id: account.id, storeId: account.store_id },
    source,
    db: makeImportDb(admin, "evolution"),
    cursor,
    warn: (msg, fields) => log.warn(msg, fields),
  });

  const actorId = await resolveActorSellerId(admin, callerId);
  if (actorId) {
    await bestEffortAudit(admin, {
      store_id: account.store_id,
      actor_id: actorId,
      action: "whatsapp_history_imported",
      resource: "whatsapp_account",
      resource_id: account.id,
      after: { ...result.stats, cursor, done: result.done, traceId },
    });
  }
  log.info("import batch processed", { accountId: account.id, ...result.stats });

  return json(result, 200);
});
