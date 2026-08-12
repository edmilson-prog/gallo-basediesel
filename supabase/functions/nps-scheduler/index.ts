import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * nps-scheduler — agendada via pg_cron de hora em hora. Cria e envia as
 * pesquisas de NPS das conversas resolvidas elegíveis, e expira as vencidas.
 *
 * De hora em hora, e não a cada minuto como os ticks de atendimento: a
 * pesquisa não é urgente, e a janela de envio já segura o disparo fora do
 * horário comercial.
 *
 * O filtro relacional vive na RPC `nps_survey_candidates`; a decisão vive no
 * motor puro `eligibility.ts`, com os dois backstops (janela retroativa e teto
 * diário) que impedem que ligar o master switch varra o backlog histórico. O
 * envio vive atrás de `INpsSurveySender`, para que a chegada do dispatch da
 * Onda 8 (PRD-141) seja uma troca de implementação.
 *
 * Idempotência: o índice único parcial em nps_surveys(conversation_id) é a
 * rede estrutural — duas execuções concorrentes não criam duas pesquisas para
 * a mesma conversa, e a segunda apenas colhe a violação e segue.
 *
 * Trilha: `audit_logs.actor_id` é NOT NULL com FK para sellers, e este ciclo
 * não tem ator humano — a trilha de negócio são as próprias colunas de
 * nps_surveys (status, sent_at, responded_at) mais o resumo retornado, que
 * nunca trunca em silêncio.
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";
import { requiredEnv } from "../_shared/env.ts";
import { HttpError, json } from "../_shared/http.ts";
import { servePost } from "../_shared/serve.ts";
import { createSecretResolver } from "../_shared/secrets.ts";
import { verifyWorkerSecret } from "../_shared/workerAuth.ts";
import {
  decideSurveys,
  type INpsCandidate,
  type INpsSchedulerSettings,
  type ISuppressionReason,
} from "./eligibility.ts";
import { buildSurveyMessage, buildSurveyUrl, firstNameOf } from "./message.ts";
import { makeWhatsAppSender, type INpsSurveySender } from "./sender.ts";

const WORKER_SECRET_NAME = "NPS_WORKER_SECRET";
const DEFAULT_PUBLIC_BASE_URL = "https://crm.gallobasediesel.com.br";

interface ISettingsRow {
  store_id: string;
  enabled: boolean;
  trigger_conversation_enabled: boolean;
  trigger_conversation_delay_hours: number;
  cooldown_days: number;
  token_expiry_days: number;
  sampling_rate: number;
  send_window_start_hour: number;
  send_window_end_hour: number;
  max_backfill_days: number;
  daily_cap: number;
}

interface ICandidateRow {
  conversation_id: string;
  store_id: string;
  customer_id: string | null;
  lead_id: string | null;
  phone_digits: string;
  recipient_name: string | null;
  closed_at: string;
  last_survey_at: string | null;
  has_active_survey: boolean;
  opt_out: boolean;
  has_human_message: boolean;
}

/** 64 chars hex — bem acima do mínimo de 32 exigido pelo PRD, e não enumerável. */
function generateToken(): string {
  return (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");
}

function toSchedulerSettings(row: ISettingsRow): INpsSchedulerSettings {
  return {
    enabled: row.enabled,
    triggerConversationEnabled: row.trigger_conversation_enabled,
    triggerConversationDelayHours: row.trigger_conversation_delay_hours,
    cooldownDays: row.cooldown_days,
    samplingRate: Number(row.sampling_rate),
    sendWindowStartHour: row.send_window_start_hour,
    sendWindowEndHour: row.send_window_end_hour,
    maxBackfillDays: row.max_backfill_days,
    dailyCap: row.daily_cap,
  };
}

function toCandidate(row: ICandidateRow): INpsCandidate {
  return {
    conversationId: row.conversation_id,
    storeId: row.store_id,
    phoneDigits: row.phone_digits,
    closedAt: row.closed_at,
    lastSurveyAt: row.last_survey_at,
    hasActiveSurvey: row.has_active_survey,
    optOut: row.opt_out,
    hasHumanMessage: row.has_human_message,
  };
}

/** Quantas pesquisas esta loja já criou hoje — alimenta o teto diário. */
async function countSentToday(admin: SupabaseClient, storeId: string): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const { count, error } = await admin
    .from("nps_surveys")
    .select("id", { count: "exact", head: true })
    .eq("store_id", storeId)
    .gte("created_at", startOfDay.toISOString());
  if (error) throw new HttpError(500, `contagem diária falhou: ${error.message}`);
  return count ?? 0;
}

async function processStore(
  admin: SupabaseClient,
  sender: INpsSurveySender,
  settingsRow: ISettingsRow,
  baseUrl: string,
  now: Date,
): Promise<{
  eligible: number;
  created: number;
  sent: number;
  failed: number;
  suppressed: Record<string, number>;
}> {
  const settings = toSchedulerSettings(settingsRow);

  const { data: candidateRows, error: candidatesError } = await admin.rpc("nps_survey_candidates", {
    p_store_id: settingsRow.store_id,
    p_backfill_days: settings.maxBackfillDays,
  });
  // Falha alto: uma RPC quebrada não pode ser confundida com fila vazia.
  if (candidatesError) {
    throw new HttpError(500, `nps_survey_candidates: ${candidatesError.message}`);
  }

  const rows = (candidateRows ?? []) as ICandidateRow[];
  const byConversation = new Map(rows.map((row) => [row.conversation_id, row]));
  const sentToday = await countSentToday(admin, settingsRow.store_id);

  const decision = decideSurveys(rows.map(toCandidate), settings, { now, sentToday });

  const suppressed: Record<string, number> = {};
  for (const rejection of decision.rejected) {
    const reason: ISuppressionReason = rejection.reason;
    suppressed[reason] = (suppressed[reason] ?? 0) + 1;
  }

  let created = 0;
  let sent = 0;
  let failed = 0;

  for (const candidate of decision.accepted) {
    const row = byConversation.get(candidate.conversationId);
    if (!row) continue;

    const token = generateToken();
    const expiresAt = new Date(now.getTime() + settingsRow.token_expiry_days * 86_400_000);

    const { data: inserted, error: insertError } = await admin
      .from("nps_surveys")
      .insert({
        store_id: row.store_id,
        conversation_id: row.conversation_id,
        customer_id: row.customer_id,
        lead_id: row.lead_id,
        phone_digits: row.phone_digits,
        recipient_name: row.recipient_name,
        trigger: "conversation_resolved",
        token,
        status: "pending",
        expires_at: expiresAt.toISOString(),
      })
      .select("id")
      .maybeSingle();

    if (insertError) {
      // Violação do índice único = outra execução já criou esta pesquisa.
      // Isso é a idempotência funcionando, não um erro.
      suppressed.duplicate = (suppressed.duplicate ?? 0) + 1;
      continue;
    }
    created += 1;

    const text = buildSurveyMessage(
      firstNameOf(row.recipient_name),
      buildSurveyUrl(baseUrl, token),
    );
    const result = await sender.send({
      conversationId: row.conversation_id,
      storeId: row.store_id,
      text,
    });

    if (result.status === "sent") {
      sent += 1;
      await admin
        .from("nps_surveys")
        .update({ status: "sent", channel: result.channel, sent_at: new Date().toISOString() })
        .eq("id", inserted?.id as string);
    } else {
      failed += 1;
      await admin
        .from("nps_surveys")
        .update({ status: "failed", channel: result.channel })
        .eq("id", inserted?.id as string);
    }
  }

  return { eligible: decision.accepted.length, created, sent, failed, suppressed };
}

/** Pesquisas enviadas cujo link venceu — deixam de contar na taxa de resposta. */
async function expireStale(admin: SupabaseClient): Promise<number> {
  const { data, error } = await admin
    .from("nps_surveys")
    .update({ status: "expired" })
    .eq("status", "sent")
    .lt("expires_at", new Date().toISOString())
    .select("id");
  if (error) throw new HttpError(500, `expiração falhou: ${error.message}`);
  return (data ?? []).length;
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

  const baseUrl = Deno.env.get("NPS_PUBLIC_BASE_URL") ?? DEFAULT_PUBLIC_BASE_URL;
  const now = new Date();

  const { data: settingsRows, error: settingsError } = await admin
    .from("nps_settings")
    .select("*")
    .eq("enabled", true);
  if (settingsError) throw new HttpError(500, `nps_settings: ${settingsError.message}`);

  const stores = (settingsRows ?? []) as ISettingsRow[];
  const expired = await expireStale(admin);

  if (stores.length === 0) {
    return json({ stores: 0, eligible: 0, created: 0, sent: 0, failed: 0, expired }, 200);
  }

  const sender = makeWhatsAppSender(admin, ctx.traceId);
  const totals = { eligible: 0, created: 0, sent: 0, failed: 0 };
  const suppressed: Record<string, number> = {};

  for (const settingsRow of stores) {
    const result = await processStore(admin, sender, settingsRow, baseUrl, now);
    totals.eligible += result.eligible;
    totals.created += result.created;
    totals.sent += result.sent;
    totals.failed += result.failed;
    for (const [reason, count] of Object.entries(result.suppressed)) {
      suppressed[reason] = (suppressed[reason] ?? 0) + count;
    }
    ctx.log.info("nps-scheduler store processed", {
      storeId: settingsRow.store_id,
      eligible: result.eligible,
      created: result.created,
      sent: result.sent,
      failed: result.failed,
    });
  }

  return json({ stores: stores.length, ...totals, expired, suppressed }, 200);
});
