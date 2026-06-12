/**
 * whatsapp-media-backfill — re-fetch inbound media the history import left
 * without bytes (real-inbox follow-up).
 *
 * The import (PRD-119) stores only text/captions, leaving media rows with
 * `media_download_status = 'failed'` and `media_url = null`. This function
 * walks those rows newest-first, downloads each from the provider by
 * `provider_message_id` (same path the webhook uses) and uploads to Storage,
 * stamping `media_url` + `ok`. Media the provider can no longer serve (WhatsApp
 * expires media after a few weeks) is counted as `expired_or_missing` and left
 * for a later attempt — never aborts the run.
 *
 * Auth: an operational admin key (`x-admin-key` == MEDIA_BACKFILL_ADMIN_KEY).
 * Deployed with `--no-verify-jwt` so the header is the gate. Service_role wires
 * the DB/Storage; the Evolution API key resolves Vault-first via _shared/secrets.
 *
 * POST { accountId?, limit?, sinceDays? }
 *   → { accountId, window, attempted, recovered, failed, reasons }
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";
import { requiredEnv } from "../_shared/env.ts";
import { HttpError, json, parseJsonBody } from "../_shared/http.ts";
import { createSecretResolver } from "../_shared/secrets.ts";
import { servePost } from "../_shared/serve.ts";
import { buildWhatsAppEngine } from "../_shared/whatsapp/build.ts";
import {
  processMediaBackfill,
  type IMediaBackfillDb,
  type IMediaBackfillItem,
} from "../_shared/whatsapp/mediaBackfill/core.ts";
import type { IEngineDeps, IIntegrationLogEntry } from "../_shared/whatsapp/types.ts";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 200;

interface IAccountRow {
  id: string;
  store_id: string;
  provider: "meta" | "evolution";
  credentials_ref: string;
  provider_config: Record<string, unknown> | null;
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

function makeBackfillDb(admin: SupabaseClient): IMediaBackfillDb {
  return {
    async listMissingMedia({ accountId, limit, sinceIso, untilIso, mediaTypes }) {
      let query = admin
        .from("messages")
        .select("id, conversation_id, provider_message_id, conversations!inner(whatsapp_account_id)")
        .eq("conversations.whatsapp_account_id", accountId)
        .not("media_type", "is", null)
        .eq("media_download_status", "failed")
        .not("provider_message_id", "is", null)
        .order("sent_at", { ascending: false })
        .limit(limit);
      if (sinceIso) query = query.gte("sent_at", sinceIso);
      if (untilIso) query = query.lte("sent_at", untilIso);
      if (mediaTypes && mediaTypes.length > 0) query = query.in("media_type", mediaTypes);
      const { data, error } = await query;
      if (error) throw new Error(`listMissingMedia: ${error.message}`);
      return (data ?? []).map(
        (row): IMediaBackfillItem => ({
          messageId: row.id as string,
          conversationId: row.conversation_id as string,
          providerMessageId: row.provider_message_id as string,
          mediaType: "",
        }),
      );
    },
    async uploadMedia(path, data, mimeType) {
      const { error } = await admin.storage
        .from("whatsapp-media")
        .upload(path, data.buffer as ArrayBuffer, { contentType: mimeType, upsert: true });
      if (error) throw new Error(`uploadMedia: ${error.message}`);
    },
    async setMessageMedia(messageId, mediaUrl) {
      await admin
        .from("messages")
        .update({ media_url: mediaUrl, media_download_status: "ok" })
        .eq("id", messageId);
    },
    async markUnavailable(messageId) {
      // 'expired' is excluded by the listMissingMedia filter (status = 'failed'),
      // so a re-run skips it; reset to 'failed' to force another attempt.
      await admin
        .from("messages")
        .update({ media_download_status: "expired" })
        .eq("id", messageId);
    },
  };
}

async function resolveAccount(
  admin: SupabaseClient,
  accountId: string | undefined,
): Promise<IAccountRow | null> {
  const columns = "id, store_id, provider, credentials_ref, provider_config";
  if (accountId) {
    const { data } = await admin
      .from("whatsapp_accounts")
      .select(columns)
      .eq("id", accountId)
      .maybeSingle<IAccountRow>();
    return data ?? null;
  }
  // No id: pick the single non-disconnected Evolution account (the common case).
  const { data } = await admin
    .from("whatsapp_accounts")
    .select(columns)
    .eq("provider", "evolution")
    .neq("status", "disconnected")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<IAccountRow>();
  return data ?? null;
}

servePost(async (req, { log, traceId }) => {
  const expectedKey = Deno.env.get("MEDIA_BACKFILL_ADMIN_KEY");
  const providedKey = req.headers.get("x-admin-key");
  if (!expectedKey || !providedKey || providedKey !== expectedKey) {
    throw new HttpError(401, "unauthorized");
  }

  const body = await parseJsonBody(req);
  const accountId = typeof body.accountId === "string" ? body.accountId : undefined;
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, typeof body.limit === "number" ? Math.floor(body.limit) : DEFAULT_LIMIT),
  );
  const sinceDays = typeof body.sinceDays === "number" ? Math.max(0, body.sinceDays) : undefined;
  const untilDays = typeof body.untilDays === "number" ? Math.max(0, body.untilDays) : undefined;
  const sinceIso =
    sinceDays !== undefined
      ? new Date(Date.now() - sinceDays * 86_400_000).toISOString()
      : undefined;
  const untilIso =
    untilDays !== undefined
      ? new Date(Date.now() - untilDays * 86_400_000).toISOString()
      : undefined;
  const mediaTypes = Array.isArray(body.mediaTypes)
    ? body.mediaTypes.filter((t): t is string => typeof t === "string")
    : undefined;

  const admin = createClient(
    requiredEnv("SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );

  const account = await resolveAccount(admin, accountId);
  if (!account) throw new HttpError(404, "no WhatsApp account found");

  const engine = buildWhatsAppEngine({
    engine: account.provider,
    accountId: account.id,
    providerConfig: account.provider_config,
    credentialsRef: account.credentials_ref,
    deps: makeEngineDeps(admin, traceId),
  });

  const result = await processMediaBackfill({
    accountId: account.id,
    limit,
    sinceIso,
    untilIso,
    mediaTypes,
    db: makeBackfillDb(admin),
    downloader: engine,
    warn: (message, fields) => log.warn(message, fields),
  });

  log.info("media backfill batch processed", { accountId: account.id, ...result });
  return json(
    { accountId: account.id, window: { sinceIso: sinceIso ?? null, untilIso: untilIso ?? null }, ...result, traceId },
    200,
  );
});
