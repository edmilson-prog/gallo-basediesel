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

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";
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
      await processSendRequest({
        input: request,
        sender: buildSystemSender(row.store_id),
        db,
        buildProvider: (account) =>
          buildWhatsAppEngine({
            engine: account.provider,
            accountId: account.id,
            providerConfig: account.providerConfig,
            credentialsRef: account.credentialsRef,
            deps,
          }),
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
