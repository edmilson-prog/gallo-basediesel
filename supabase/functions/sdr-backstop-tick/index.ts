import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * sdr-backstop-tick — agendada via pg_cron a cada 1 minuto (mesmo padrão de
 * scheduled-send-tick). Varre conversas em fila das lojas com sdr_enabled=true,
 * calcula o threshold por loja (0 fora do horário comercial,
 * backstop_timeout_minutes dentro dele) e liga o SDR nas que estouraram.
 *
 * docs/superpowers/specs/2026-07-15-sdr-producao-parte-b-ativacao-design.md
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";
import { requiredEnv } from "../_shared/env.ts";
import { HttpError, json } from "../_shared/http.ts";
import { servePost } from "../_shared/serve.ts";
import { createSecretResolver } from "../_shared/secrets.ts";
import { verifyWorkerSecret } from "../_shared/workerAuth.ts";
import { isWithinBusinessHours } from "../_shared/distribution/engine/businessHours.ts";

const WORKER_SECRET_NAME = "SDR_WORKER_SECRET";

interface IQueuedConversationRow {
  id: string;
  store_id: string;
  queued_at: string;
  whatsapp_account_id: string | null;
}
interface IPilotStoreRow {
  store_id: string;
  backstop_timeout_minutes: number;
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

  // 1. Only stores opted into the pilot.
  const { data: pilotStores } = await admin
    .from("sdr_settings")
    .select("store_id, backstop_timeout_minutes")
    .eq("sdr_enabled", true);
  const pilotRows = (pilotStores ?? []) as IPilotStoreRow[];
  if (pilotRows.length === 0) return json({ activated: 0 }, 200);
  const timeoutByStore = new Map(pilotRows.map((r) => [r.store_id, r.backstop_timeout_minutes]));

  // 2. Queued conversations for those stores (uses conversations_sdr_backstop_queue_idx).
  const { data: queued } = await admin
    .from("conversations")
    .select("id, store_id, queued_at, whatsapp_account_id")
    .in("store_id", pilotRows.map((r) => r.store_id))
    .is("assigned_seller_id", null)
    .eq("is_sdr_active", false)
    .eq("status", "aguardando")
    .not("queued_at", "is", null);
  let rows = (queued ?? []) as IQueuedConversationRow[];
  if (rows.length === 0) return json({ activated: 0 }, 200);

  // 2.5. Drop conversations whose WhatsApp instance hasn't opted into the SDR
  // (Parte C — per-instance scoping on top of the store-wide switch).
  const accountIds = [...new Set(rows.map((r) => r.whatsapp_account_id).filter((id): id is string => id !== null))];
  const { data: sdrAccounts } = await admin
    .from("whatsapp_accounts")
    .select("id")
    .in("id", accountIds.length > 0 ? accountIds : [""])
    .eq("sdr_enabled", true);
  const enabledAccountIds = new Set((sdrAccounts ?? []).map((a) => a.id as string));
  rows = rows.filter((r) => r.whatsapp_account_id !== null && enabledAccountIds.has(r.whatsapp_account_id));
  if (rows.length === 0) return json({ activated: 0 }, 200);

  // 3. Business hours per store (jsonb blob — see stores.settings.distribution.businessHours).
  const storeIds = [...new Set(rows.map((r) => r.store_id))];
  const { data: stores } = await admin.from("stores").select("id, settings").in("id", storeIds);
  const businessHoursByStore = new Map<string, boolean>();
  const now = new Date();
  for (const store of stores ?? []) {
    const settings = store.settings as { distribution?: { businessHours?: unknown } } | null;
    const windows = (settings?.distribution?.businessHours ?? []) as Parameters<
      typeof isWithinBusinessHours
    >[1];
    businessHoursByStore.set(store.id as string, isWithinBusinessHours(now, windows));
  }

  // 4. Activate whoever crossed the threshold, fire sdr-respond fire-and-forget.
  const sdrRespondUrl = `${requiredEnv("SUPABASE_URL")}/functions/v1/sdr-respond`;
  const workerSecret = expected!;
  let activated = 0;
  for (const row of rows) {
    const withinHours = businessHoursByStore.get(row.store_id) ?? false;
    const thresholdMinutes = withinHours ? (timeoutByStore.get(row.store_id) ?? 2) : 0;
    const elapsedMs = now.getTime() - new Date(row.queued_at).getTime();
    if (elapsedMs < thresholdMinutes * 60_000) continue;

    const { data: updated, error: updErr } = await admin
      .from("conversations")
      .update({ is_sdr_active: true })
      .eq("id", row.id)
      .eq("is_sdr_active", false) // idempotency guard against concurrent ticks
      .select("id");
    if (updErr) {
      ctx.log.error("sdr-backstop-tick activation failed", { conversationId: row.id, error: updErr.message });
      continue;
    }
    if (!updated || updated.length === 0) continue; // lost the race to a concurrent tick — don't double-fire
    activated++;
    fetch(sdrRespondUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-worker-secret": workerSecret },
      body: JSON.stringify({ conversationId: row.id }),
    }).catch((err) => ctx.log.warn("sdr-respond dispatch failed", { conversationId: row.id, error: String(err) }));
  }

  return json({ activated }, 200);
});
