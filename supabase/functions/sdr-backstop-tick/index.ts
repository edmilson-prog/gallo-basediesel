import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * sdr-backstop-tick — scheduled via pg_cron every minute. Activates the SDR
 * on queued conversations of pilot stores/instances whose customer crossed
 * the wait threshold.
 *
 * Eligibility redesign (2026-07-20, after the mass-dispatch incident — see
 * docs/superpowers/specs/2026-07-20-sdr-backstop-eligibility-fix-design.md):
 * the relational filter lives in the sdr_backstop_candidates RPC (pilot
 * gates, queue state, last-message-is-inbound, activation stamps, 24h
 * window). This tick applies the per-store business-hours threshold via the
 * pure eligibility engine, a hard per-tick cap (never silent), and the
 * idempotent claim before the fire-and-forget dispatch to sdr-respond.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";
import { requiredEnv } from "../_shared/env.ts";
import { HttpError, json } from "../_shared/http.ts";
import { servePost } from "../_shared/serve.ts";
import { createSecretResolver } from "../_shared/secrets.ts";
import { verifyWorkerSecret } from "../_shared/workerAuth.ts";
import {
  MAX_ACTIVATIONS_PER_TICK,
  decideActivations,
  type IBackstopCandidate,
  type IStorePilotConfig,
} from "./eligibility.ts";

const WORKER_SECRET_NAME = "SDR_WORKER_SECRET";

interface ICandidateRow {
  conversation_id: string;
  store_id: string;
  whatsapp_account_id: string;
  last_inbound_at: string;
}

servePost(async (req, ctx) => {
  const admin = createClient(
    requiredEnv("SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );

  const expected = await createSecretResolver(admin)(WORKER_SECRET_NAME);
  const provided = req.headers.get("x-worker-secret") ?? "";
  if (!verifyWorkerSecret(provided, expected)) throw new HttpError(401, "unauthorized");

  // 1. Candidates: single RPC round-trip with the whole relational filter,
  // FIFO by last_inbound_at. Fails loudly — a broken RPC must never be
  // mistaken for an empty queue.
  const { data: candidateRows, error: candidatesError } = await admin.rpc(
    "sdr_backstop_candidates",
  );
  if (candidatesError) {
    throw new HttpError(500, `sdr_backstop_candidates failed: ${candidatesError.message}`);
  }
  const rows = (candidateRows ?? []) as ICandidateRow[];
  if (rows.length === 0) return json({ eligible: 0, activated: 0, capped: 0 }, 200);

  const candidates: IBackstopCandidate[] = rows.map((row) => ({
    conversationId: row.conversation_id,
    storeId: row.store_id,
    whatsappAccountId: row.whatsapp_account_id,
    lastInboundAt: row.last_inbound_at,
  }));

  // 2. Per-store pilot config: timeout minutes + business-hours windows
  // (stores.settings.distribution.businessHours jsonb blob).
  const storeIds = [...new Set(candidates.map((candidate) => candidate.storeId))];
  const [{ data: settingsRows }, { data: storeRows }] = await Promise.all([
    admin.from("sdr_settings").select("store_id, backstop_timeout_minutes").in("store_id", storeIds),
    admin.from("stores").select("id, settings").in("id", storeIds),
  ]);
  const windowsByStore = new Map<string, IStorePilotConfig["businessHours"]>();
  for (const store of storeRows ?? []) {
    const settings = store.settings as { distribution?: { businessHours?: unknown } } | null;
    windowsByStore.set(
      store.id as string,
      (settings?.distribution?.businessHours ?? []) as IStorePilotConfig["businessHours"],
    );
  }
  const configByStore = new Map<string, IStorePilotConfig>();
  for (const row of settingsRows ?? []) {
    configByStore.set(row.store_id as string, {
      timeoutMinutes: row.backstop_timeout_minutes as number,
      businessHours: windowsByStore.get(row.store_id as string) ?? [],
    });
  }

  // 3. Pure decision: threshold per store + hard cap. Capping is never
  // silent (spec: no silent caps).
  const decision = decideActivations(candidates, configByStore, new Date());
  if (decision.cappedCount > 0) {
    ctx.log.warn("sdr-backstop-tick cap engaged", {
      eligible: decision.eligibleCount,
      capped: decision.cappedCount,
      cap: MAX_ACTIVATIONS_PER_TICK,
    });
  }

  // 4. Claim + fire — unchanged idiom: guarded UPDATE + affected-row check
  // so overlapping ticks never double-fire, then fire-and-forget dispatch.
  const sdrRespondUrl = `${requiredEnv("SUPABASE_URL")}/functions/v1/sdr-respond`;
  const workerSecret = expected!;
  let activated = 0;
  for (const candidate of decision.toActivate) {
    const { data: updated, error: updErr } = await admin
      .from("conversations")
      .update({ is_sdr_active: true })
      .eq("id", candidate.conversationId)
      .eq("is_sdr_active", false)
      .select("id");
    if (updErr) {
      ctx.log.error("sdr-backstop-tick activation failed", {
        conversationId: candidate.conversationId,
        error: updErr.message,
      });
      continue;
    }
    if (!updated || updated.length === 0) continue; // lost the race to a concurrent tick
    activated++;
    fetch(sdrRespondUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-worker-secret": workerSecret },
      body: JSON.stringify({ conversationId: candidate.conversationId }),
    }).catch((err) =>
      ctx.log.warn("sdr-respond dispatch failed", {
        conversationId: candidate.conversationId,
        error: String(err),
      }),
    );
  }

  ctx.log.info("sdr-backstop-tick summary", {
    eligible: decision.eligibleCount,
    activated,
    capped: decision.cappedCount,
  });
  return json({ eligible: decision.eligibleCount, activated, capped: decision.cappedCount }, 200);
});
