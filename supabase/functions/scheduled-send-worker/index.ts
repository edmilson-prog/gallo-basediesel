/**
 * scheduled-send-worker — server-side dispatcher for due scheduled sends
 * (PRD-027 RNF-007 → production).
 *
 * Replaces the in-browser poller (`useScheduledSendRunner`, mock-only now) so a
 * scheduled message fires even with no browser open. A pg_cron tick POSTs here
 * every minute; this function:
 *   1. authenticates the caller by a shared secret (`x-worker-secret`, Vault),
 *      since it is PUBLIC (verify_jwt off);
 *   2. atomically claims due `pending` rows via `claim_due_scheduled_sends`
 *      (FOR UPDATE SKIP LOCKED — overlapping ticks never double-claim);
 *   3. dispatches each through the SAME `processSendRequest` pipeline as a
 *      manual send (24h window, failover, persist-before-send, status tracking,
 *      audit) using a trusted system sender;
 *   4. flips each scheduled row to 'sent' / 'failed'.
 *
 * At-least-once: a crash AFTER provider dispatch but BEFORE the row is flipped
 * leaves it 'pending'; it is re-claimable only after a 5-min staleness window
 * (see the claim RPC), so an accidental resend is rare and bounded.
 *
 * Only `snippet` (plain text — the only kind the composer schedules) is
 * dispatchable; other payloads fail loudly (NOT_SUPPORTED) — see scheduled/core.
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";
import { requiredEnv } from "../_shared/env.ts";
import { HttpError, json } from "../_shared/http.ts";
import { servePost } from "../_shared/serve.ts";
import { createSecretResolver } from "../_shared/secrets.ts";
import { makeSendDb, makeEngineDeps } from "../_shared/whatsappSendAdapter.ts";
import { buildWhatsAppEngine } from "../_shared/whatsapp/build.ts";
import { processSendRequest } from "../_shared/whatsapp/send/core.ts";
import {
  buildScheduledSendRequest,
  buildSystemSender,
  type IScheduledPayload,
} from "../_shared/whatsapp/scheduled/core.ts";

/**
 * Pre-resolves the Evolution Go server `base_url` for accounts involved in
 * a scheduled send (primary + optional failover). Returns a Map<accountId, baseUrl>.
 *
 * Registry-based Go accounts store `base_url` on `whatsapp_go_servers`, NOT in
 * `provider_config` — so `buildWhatsAppEngine` would receive an empty `baseUrl`
 * and throw VALIDATION_ERROR. Fast-exits for non-Go conversations (most sends).
 */
async function resolveGoBaseUrls(
  admin: SupabaseClient,
  conversationId: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();

  // Step 1: conversation → primary account ID
  const { data: conv } = await admin
    .from("conversations")
    .select("whatsapp_account_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv?.whatsapp_account_id) return map;

  // Step 2: load the primary account
  const { data: primary } = await admin
    .from("whatsapp_accounts")
    .select("id, provider, go_server_id, failover_account_id, provider_config")
    .eq("id", conv.whatsapp_account_id as string)
    .maybeSingle();
  if (!primary || primary.provider !== "evolution-go") return map; // Fast exit for non-Go

  // Step 3: collect primary + failover (both may be evolution-go and need base_url)
  const accountsToCheck: Array<{
    id: string;
    provider: string;
    go_server_id: string | null;
    provider_config: Record<string, unknown> | null;
  }> = [primary as typeof primary & { id: string; provider: string }];
  if (primary.failover_account_id) {
    const { data: failover } = await admin
      .from("whatsapp_accounts")
      .select("id, provider, go_server_id, provider_config")
      .eq("id", primary.failover_account_id as string)
      .maybeSingle();
    if (failover) {
      accountsToCheck.push(
        failover as typeof failover & { id: string; provider: string },
      );
    }
  }

  // Step 4: for each Go account lacking base_url in provider_config, fetch it
  // from whatsapp_go_servers (the server registry).
  for (const acc of accountsToCheck) {
    if (acc.provider !== "evolution-go") continue;
    if ((acc.provider_config as Record<string, unknown> | null)?.baseUrl) continue; // Already populated
    if (!acc.go_server_id) continue;
    const { data: server } = await admin
      .from("whatsapp_go_servers")
      .select("base_url")
      .eq("id", acc.go_server_id as string)
      .maybeSingle();
    if (server?.base_url) {
      map.set(acc.id as string, String(server.base_url).replace(/\/+$/, ""));
    }
  }

  return map;
}

const WORKER_SECRET_NAME = "SCHEDULED_WORKER_SECRET";
const BATCH_LIMIT = 50;
const MAX_REASON_LENGTH = 500;

/** Constant-time string compare (matches the house HMAC-compare discipline). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

interface IScheduledRow {
  id: string;
  store_id: string;
  conversation_id: string;
  scheduled_for: string;
  payload: IScheduledPayload;
  status: string;
  created_by: string;
}

servePost(async (req, ctx) => {
  const admin = createClient(
    requiredEnv("SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );

  // The function is public — the shared secret is the only gate. Vault-first
  // (rotatable in "Integrações & Chaves"), env fallback. Missing secret = deny.
  const expected = await createSecretResolver(admin)(WORKER_SECRET_NAME);
  const provided = req.headers.get("x-worker-secret") ?? "";
  if (!expected || !safeEqual(provided, expected)) {
    throw new HttpError(401, "unauthorized");
  }

  const { data: claimed, error: claimErr } = await admin.rpc("claim_due_scheduled_sends", {
    p_limit: BATCH_LIMIT,
  });
  if (claimErr) throw new Error(`claim_due_scheduled_sends: ${claimErr.message}`);
  const rows = (claimed ?? []) as IScheduledRow[];

  const db = makeSendDb(admin, ctx.traceId);
  const deps = makeEngineDeps(admin, ctx.traceId);
  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const request = buildScheduledSendRequest(row.conversation_id, row.payload);
      // Pre-resolve Go server base_url for evolution-go accounts involved in this send.
      // Registry-based Go accounts don't store base_url in provider_config; it lives on
      // whatsapp_go_servers. Fast-exits for non-Go conversations (no overhead for most rows).
      const goBaseUrls = await resolveGoBaseUrls(admin, row.conversation_id);
      await processSendRequest({
        input: request,
        sender: buildSystemSender(row.store_id),
        db,
        buildProvider: (account) => {
          // Inject base_url from the server registry when the account is evolution-go
          // and providerConfig does not already have it (old accounts may still carry it).
          let providerConfig = account.providerConfig;
          if (account.provider === "evolution-go" && !providerConfig?.baseUrl) {
            const serverBaseUrl = goBaseUrls.get(account.id);
            if (serverBaseUrl) providerConfig = { ...providerConfig, baseUrl: serverBaseUrl };
          }
          return buildWhatsAppEngine({
            engine: account.provider,
            accountId: account.id,
            providerConfig,
            credentialsRef: account.credentialsRef,
            deps,
          });
        },
        traceId: ctx.traceId,
      });
      await admin.from("scheduled_sends").update({ status: "sent" }).eq("id", row.id);
      sent++;
    } catch (err) {
      // Window-closed / closed-conversation / invalid-number / unsupported type
      // all surface here as a thrown error → the row fails WITH a reason the
      // seller sees in the ScheduledList, never a silent drop.
      const reason = err instanceof Error ? err.message : "Falha desconhecida no envio agendado";
      await admin
        .from("scheduled_sends")
        .update({ status: "failed", failure_reason: reason.slice(0, MAX_REASON_LENGTH) })
        .eq("id", row.id);
      failed++;
      ctx.log.warn("scheduled send failed", { id: row.id, reason });
    }
  }

  if (rows.length > 0) {
    ctx.log.info("scheduled batch processed", { claimed: rows.length, sent, failed });
  }
  return json({ claimed: rows.length, sent, failed, traceId: ctx.traceId }, 200);
});
