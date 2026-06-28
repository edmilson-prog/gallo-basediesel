/**
 * whatsapp-import-history-go — owner-only ingestion of an Evolution Go account's
 * WhatsApp history (Phase 2 Etapa B).
 *
 * Unlike the Evolution import (which pages a REST store), Evolution Go has no
 * synchronous chat pull: the history only ever arrives as HistorySync webhook
 * chunks at device pairing, already captured RAW into integration_logs. This
 * edge REPLAYS those chunks — no re-pairing needed once captured.
 *
 * POST { accountId, action }:
 *  - "prepare" → stream the account's HistorySync chunks, aggregate (resolve
 *    @lid via the chunks' phoneNumberToLidMappings, dedup across chunks), and
 *    stage one row per importable 1:1 chat. → { total, stats }
 *  - "land"    → land up to BATCH staged rows via the shared landNormalizedChat
 *    (pool conversation, dedup by provider_message_id). Client loops until done.
 *    → { done, landed, remaining, stats }
 *  - "undo"    → remove exactly what was landed (set-based RPC). → { removedMessages, removedConversations }
 *
 * Idempotent: re-running never duplicates (provider_message_id unique + upsert).
 * Errors: house `{ error, code }` contract.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";
import { bestEffortAudit } from "../_shared/audit.ts";
import { requireCaller } from "../_shared/auth.ts";
import { HttpError, json, parseJsonBody } from "../_shared/http.ts";
import { servePost } from "../_shared/serve.ts";
import { makeImportDb } from "../_shared/import-db.ts";
import {
  emptyImportStats,
  landNormalizedChat,
  type IImportStats,
  type INormalizedRecord,
} from "../_shared/whatsapp/import/core.ts";
import {
  createHistoryAggregator,
  type IGoAggregateStats,
  type IGoHistoryChunk,
} from "../_shared/whatsapp/import/history-core.ts";

/** Endpoint the webhook capture (Etapa A) writes each HistorySync chunk under. */
const HISTORY_ENDPOINT = "/whatsapp-webhook/evolution-go#HistorySync";

/** Conversations landed per `land` call — keep small; the client loops. */
const LAND_BATCH = 25;
/** Rows per staging insert (PostgREST payload size guard). */
const STAGE_CHUNK = 100;

interface IGoAccountRow {
  id: string;
  store_id: string;
  provider: string;
  provider_config: { instanceId?: string } | null;
}

function jsonError(message: string, code: string, status: number): Response {
  return json({ error: message, code }, status);
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

async function audit(
  admin: SupabaseClient,
  callerId: string,
  account: IGoAccountRow,
  action: string,
  after: Record<string, unknown>,
): Promise<void> {
  const actorId = await resolveActorSellerId(admin, callerId);
  if (!actorId) return;
  await bestEffortAudit(admin, {
    store_id: account.store_id,
    actor_id: actorId,
    action,
    resource: "whatsapp_account",
    resource_id: account.id,
    after,
  });
}

/**
 * Stream the account's captured HistorySync chunks into the aggregator and
 * stage the distilled importable chats. Memory-safe: the small response_payload
 * list resolves which logs belong to this instance, then each (multi-MB)
 * request_payload is fetched, folded, and discarded one at a time.
 */
async function prepare(
  admin: SupabaseClient,
  account: IGoAccountRow,
  instanceId: string,
  log: { warn: (msg: string, fields?: Record<string, unknown>) => void },
): Promise<{ total: number; stats: IGoAggregateStats }> {
  const { data: rows, error } = await admin
    .from("integration_logs")
    .select("id, response_payload")
    .eq("endpoint", HISTORY_ENDPOINT)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`prepare: list chunks: ${error.message}`);

  const ids = (rows ?? [])
    .filter((r) => (r.response_payload as { instanceId?: string } | null)?.instanceId === instanceId)
    .map((r) => r.id as string);

  const agg = createHistoryAggregator();
  for (const id of ids) {
    const { data: row, error: chunkError } = await admin
      .from("integration_logs")
      .select("request_payload")
      .eq("id", id)
      .single();
    if (chunkError) {
      log.warn("prepare: skip unreadable chunk", { id, detail: chunkError.message });
      continue;
    }
    const data = (row?.request_payload as { data?: { Data?: IGoHistoryChunk } } | null)?.data?.Data;
    if (data) agg.addChunk(data);
  }

  const { items, stats } = agg.finalize();

  // Rebuild staging from scratch: distillation is deterministic, and re-landing
  // is dedup-safe, so a clean slate keeps staging an exact mirror of the latest
  // capture (and a faithful undo manifest).
  const { error: clearError } = await admin
    .from("whatsapp_go_history_items")
    .delete()
    .eq("account_id", account.id);
  if (clearError) throw new Error(`prepare: clear staging: ${clearError.message}`);

  const stageRows = items.map((it) => ({
    account_id: account.id,
    store_id: account.store_id,
    phone: it.phone,
    contact_name: it.name,
    messages: it.messages,
    landed: false,
  }));
  for (let i = 0; i < stageRows.length; i += STAGE_CHUNK) {
    const { error: insertError } = await admin
      .from("whatsapp_go_history_items")
      .insert(stageRows.slice(i, i + STAGE_CHUNK));
    if (insertError) throw new Error(`prepare: stage insert: ${insertError.message}`);
  }

  return { total: items.length, stats };
}

/** Land one cursored batch of staged chats. */
async function land(
  admin: SupabaseClient,
  account: { id: string; storeId: string },
  log: { warn: (msg: string, fields?: Record<string, unknown>) => void },
): Promise<{ done: boolean; landed: number; remaining: number; stats: IImportStats }> {
  const { data: pending, error } = await admin
    .from("whatsapp_go_history_items")
    .select("id, phone, messages")
    .eq("account_id", account.id)
    .eq("landed", false)
    .order("created_at", { ascending: true })
    .limit(LAND_BATCH);
  if (error) throw new Error(`land: read staging: ${error.message}`);

  const batch = pending ?? [];
  const stats = emptyImportStats();
  const db = makeImportDb(admin, "evolution-go");
  const landedIds: string[] = [];

  for (const item of batch) {
    try {
      await landNormalizedChat({
        account,
        db,
        phone: item.phone as string,
        normalized: ((item.messages as INormalizedRecord[] | null) ?? []),
        stats,
      });
      landedIds.push(item.id as string);
    } catch (e) {
      // A poisoned row must not wedge the loop — it stays pending and is retried;
      // the client stalls-out (landed=0 with remaining>0) and surfaces an error.
      log.warn("land: item failed, left pending", {
        phone: item.phone,
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  }

  if (landedIds.length > 0) {
    await admin
      .from("whatsapp_go_history_items")
      .update({ landed: true, updated_at: new Date().toISOString() })
      .in("id", landedIds);
  }

  const { count } = await admin
    .from("whatsapp_go_history_items")
    .select("id", { count: "exact", head: true })
    .eq("account_id", account.id)
    .eq("landed", false);
  const remaining = count ?? 0;

  return { done: remaining === 0, landed: landedIds.length, remaining, stats };
}

servePost(async (req, { log, traceId }) => {
  const { callerId, admin, profile } = await requireCaller(req, ["owner"]);
  const body = await parseJsonBody(req);
  const accountId = typeof body.accountId === "string" ? body.accountId : "";
  const action = typeof body.action === "string" ? body.action : "";
  if (!accountId) throw new HttpError(400, "accountId is required");

  const { data: account } = await admin
    .from("whatsapp_accounts")
    .select("id, store_id, provider, provider_config")
    .eq("id", accountId)
    .eq("store_id", profile.store_id)
    .maybeSingle<IGoAccountRow>();
  if (!account) return jsonError("conta não encontrada nesta loja", "NOT_FOUND", 404);
  if (account.provider !== "evolution-go") {
    return jsonError("importação de histórico disponível apenas para contas Evolution Go", "VALIDATION_ERROR", 422);
  }
  const instanceId = account.provider_config?.instanceId;
  if (!instanceId) {
    return jsonError("conta sem instanceId — reconecte a instância antes de importar", "CONFIG_MISSING", 422);
  }

  if (action === "prepare") {
    const result = await prepare(admin, account, instanceId, log);
    await audit(admin, callerId, account, "whatsapp_go_history_prepared", { ...result.stats, total: result.total, traceId });
    log.info("go history prepared", { accountId: account.id, total: result.total });
    return json(result, 200);
  }

  if (action === "land") {
    const result = await land(admin, { id: account.id, storeId: account.store_id }, log);
    if (result.done) {
      await audit(admin, callerId, account, "whatsapp_go_history_imported", { remaining: result.remaining, traceId });
    }
    return json(result, 200);
  }

  if (action === "undo") {
    const { data, error } = await admin.rpc("undo_go_history_import", { p_account_id: account.id });
    if (error) return jsonError(`falha ao desfazer a importação: ${error.message}`, "UNDO_FAILED", 500);
    await audit(admin, callerId, account, "whatsapp_go_history_import_undone", { ...(data ?? {}), traceId });
    log.info("go history undone", { accountId: account.id, ...(data ?? {}) });
    return json(data ?? {}, 200);
  }

  return jsonError("ação inválida (use prepare | land | undo)", "VALIDATION_ERROR", 400);
});
