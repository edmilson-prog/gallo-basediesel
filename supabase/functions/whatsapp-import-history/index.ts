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
import {
  processImportBatch,
  type IImportDb,
  type IImportSource,
} from "../_shared/whatsapp/import/core.ts";
import type { IEngineDeps, IIntegrationLogEntry } from "../_shared/whatsapp/types.ts";

/** PostgREST-safe chunk sizes (URL length for `in`, payload for bulk insert). */
const FILTER_CHUNK = 200;
const INSERT_CHUNK = 500;

/** Closed conversations are never reused — keep in sync with whatsapp-webhook. */
const CLOSED_CONVERSATION_STATUSES = ["resolvida", "arquivada"];

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

function makeImportDb(admin: SupabaseClient): IImportDb {
  return {
    async findCustomerByPhone(storeId, phoneDigits) {
      // Suffix narrow in SQL, exact digit match in code (mirrors the webhook).
      const { data } = await admin
        .from("customers")
        .select("id, seller_id, phone")
        .eq("store_id", storeId)
        .like("phone", `%${phoneDigits.slice(-8)}`);
      const row = (data ?? []).find(
        (candidate) => String(candidate.phone).replace(/\D/g, "") === phoneDigits,
      );
      return row ? { id: row.id as string, sellerId: row.seller_id as string } : null;
    },
    async resolveDefaultSellerId(storeId) {
      const { data: store } = await admin
        .from("stores")
        .select("manager_id")
        .eq("id", storeId)
        .maybeSingle();
      if (store?.manager_id) return store.manager_id as string;
      const { data: seller } = await admin
        .from("sellers")
        .select("id")
        .eq("store_id", storeId)
        .eq("active", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!seller) throw new Error(`store ${storeId} has no active seller for auto-assignment`);
      return seller.id as string;
    },
    async createPendingCustomer({ storeId, phone, sellerId }) {
      const { data, error } = await admin
        .from("customers")
        .insert({
          store_id: storeId,
          // customers_type_check requires uppercase 'B2C' (matches the app/seed).
          type: "B2C",
          phone,
          full_name: phone,
          seller_id: sellerId,
          status: "ativo",
          tags: ["pending_review"],
        })
        .select("id, seller_id")
        .single();
      if (error) throw new Error(`createPendingCustomer: ${error.message}`);
      return { id: data.id as string, sellerId: data.seller_id as string };
    },
    async findOpenConversation(customerId, accountId) {
      const { data } = await admin
        .from("conversations")
        .select("id")
        .eq("customer_id", customerId)
        .eq("whatsapp_account_id", accountId)
        .not("status", "in", `(${CLOSED_CONVERSATION_STATUSES.join(",")})`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data ? { id: data.id as string } : null;
    },
    async createConversation(input) {
      const { data, error } = await admin
        .from("conversations")
        .insert({
          store_id: input.storeId,
          customer_id: input.customerId,
          whatsapp_account_id: input.accountId,
          assigned_seller_id: input.assignedSellerId,
          channel: "whatsapp",
          status: input.status,
          last_message_at: input.lastMessageAt,
          unread_count: 0,
          created_at: input.createdAt,
        })
        .select("id")
        .single();
      if (error) throw new Error(`createConversation: ${error.message}`);
      return { id: data.id as string };
    },
    async filterKnownProviderMessageIds(ids) {
      const known = new Set<string>();
      for (let i = 0; i < ids.length; i += FILTER_CHUNK) {
        const { data } = await admin
          .from("messages")
          .select("provider_message_id")
          .in("provider_message_id", ids.slice(i, i + FILTER_CHUNK));
        for (const row of data ?? []) {
          if (row.provider_message_id) known.add(row.provider_message_id as string);
        }
      }
      return known;
    },
    async insertImportedMessages(rows) {
      for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
        const chunk = rows.slice(i, i + INSERT_CHUNK).map((row) => ({
          conversation_id: row.conversationId,
          direction: row.direction,
          author_type: row.direction === "in" ? "customer" : "seller",
          author_id: row.authorId,
          provider: "evolution",
          text: row.text,
          media_type: row.mediaType,
          // Spec §3: historical media is NOT downloaded — eligible for manual retry.
          media_download_status: row.mediaType ? "failed" : null,
          status: row.status,
          sent_at: row.sentAt,
          provider_message_id: row.providerMessageId,
          // webhook_event_ids omitted on purpose — DB default '{}' applies;
          // imported rows carry no webhook event key.
        }));
        // ignoreDuplicates → ON CONFLICT (provider_message_id) DO NOTHING: the
        // unique index closes the race against the live webhook.
        const { error } = await admin
          .from("messages")
          .upsert(chunk, { onConflict: "provider_message_id", ignoreDuplicates: true });
        if (error) throw new Error(`insertImportedMessages: ${error.message}`);
      }
    },
    async advanceConversationActivity(conversationId, lastMessageAt) {
      // Advance-only: imported history must never walk last_message_at backwards.
      await admin
        .from("conversations")
        .update({ last_message_at: lastMessageAt, updated_at: new Date().toISOString() })
        .eq("id", conversationId)
        .lt("last_message_at", lastMessageAt);
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
    db: makeImportDb(admin),
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
