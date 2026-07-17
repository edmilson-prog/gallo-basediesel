import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * sdr-escalation-timeout-tick — agendada via pg_cron a cada 1 minuto (mesmo
 * padrão de sdr-backstop-tick). Fecha dois gaps do handoff SDR→humano
 * (docs/superpowers/specs/2026-07-16-sdr-escalonamento-timeout-broadcast-design.md):
 *
 *  Frente A — escalação 'pending' (chooseHumanSeller não achou ninguém):
 *    dispara o broadcast IMEDIATAMENTE (não há ninguém esperando responder)
 *    e corrige conversations.is_sdr_active, que fica órfão nesse caminho.
 *  Frente B — escalação 'assigned' sem resposta do vendedor além do
 *    threshold configurado (sdr_settings.escalation_timeout_urgent_minutes /
 *    _normal_minutes, por modo — 'standard' usa o threshold normal).
 *
 * Ambas convergem no mesmo passo final: marca urgent_broadcast_at e insere
 * uma notificação (tabela notifications) para todo seller com acesso à
 * instância WhatsApp da conversa, exceto o já atribuído (se houver).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";
import { requiredEnv } from "../_shared/env.ts";
import { HttpError, json } from "../_shared/http.ts";
import { servePost } from "../_shared/serve.ts";
import { createSecretResolver } from "../_shared/secrets.ts";
import { verifyWorkerSecret } from "../_shared/workerAuth.ts";

const WORKER_SECRET_NAME = "SDR_WORKER_SECRET";

interface IEscalationRow {
  id: string;
  conversation_id: string;
  assigned_seller_id: string | null;
  assigned_at: string | null;
  mode: "urgent" | "normal" | "standard";
  context_summary: { customerName?: string } | null;
  created_at: string;
}
interface IConversationRow {
  id: string;
  whatsapp_account_id: string | null;
  store_id: string;
}
interface IPilotThresholds {
  store_id: string;
  escalation_timeout_urgent_minutes: number;
  escalation_timeout_normal_minutes: number;
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

  const ESCALATION_COLUMNS =
    "id, conversation_id, assigned_seller_id, assigned_at, mode, context_summary, created_at";

  // 1. Frente A — pending, never broadcast: fire immediately (no one is
  // waiting to respond, so there is no timeout to wait out).
  const { data: pendingRows } = await admin
    .from("sdr_escalations")
    .select(ESCALATION_COLUMNS)
    .eq("status", "pending")
    .is("urgent_broadcast_at", null);
  const pending = (pendingRows ?? []) as IEscalationRow[];

  // 2. Frente B — assigned, no response yet, past the store's threshold for its mode.
  const { data: assignedRows } = await admin
    .from("sdr_escalations")
    .select(ESCALATION_COLUMNS)
    .eq("status", "assigned")
    .is("first_human_response_at", null)
    .is("urgent_broadcast_at", null)
    .not("assigned_at", "is", null);
  const assignedCandidates = (assignedRows ?? []) as IEscalationRow[];

  let overdue: IEscalationRow[] = [];
  if (assignedCandidates.length > 0) {
    const convIds = [...new Set(assignedCandidates.map((e) => e.conversation_id))];
    const { data: convsForThresholds } = await admin
      .from("conversations")
      .select("id, store_id")
      .in("id", convIds);
    const storeByConv = new Map(
      (convsForThresholds ?? []).map((c) => [c.id as string, c.store_id as string]),
    );
    const storeIds = [...new Set([...storeByConv.values()])];
    const { data: settingsRows } = await admin
      .from("sdr_settings")
      .select("store_id, escalation_timeout_urgent_minutes, escalation_timeout_normal_minutes")
      .in("store_id", storeIds.length > 0 ? storeIds : [""]);
    const thresholdsByStore = new Map(
      (settingsRows ?? []).map((r) => [r.store_id as string, r as IPilotThresholds]),
    );
    const now = Date.now();
    overdue = assignedCandidates.filter((e) => {
      const storeId = storeByConv.get(e.conversation_id);
      const t = storeId ? thresholdsByStore.get(storeId) : undefined;
      // 'standard' mode (reachable — see defaultModeFor's 'sdr_failed'/'out_of_scope'
      // fallback) uses the normal threshold; only 'urgent' gets the shorter one.
      const minutes =
        e.mode === "urgent"
          ? (t?.escalation_timeout_urgent_minutes ?? 5)
          : (t?.escalation_timeout_normal_minutes ?? 30);
      const elapsedMs = now - new Date(e.assigned_at!).getTime();
      return elapsedMs >= minutes * 60_000;
    });
  }

  const toProcess = [...pending, ...overdue];
  if (toProcess.length === 0) return json({ broadcast: 0 }, 200);

  // 3. Resolve every candidate's WhatsApp instance and store in one query
  // (store_id feeds the notification rows below, mirroring the sibling
  // notify_conversation_participant_added trigger's `c.store_id` join).
  const conversationIds = [...new Set(toProcess.map((e) => e.conversation_id))];
  const { data: convRows } = await admin
    .from("conversations")
    .select("id, whatsapp_account_id, store_id")
    .in("id", conversationIds);
  const accountByConv = new Map(
    ((convRows ?? []) as IConversationRow[]).map((c) => [c.id, c.whatsapp_account_id]),
  );
  const storeIdByConv = new Map(
    ((convRows ?? []) as IConversationRow[]).map((c) => [c.id, c.store_id]),
  );

  let broadcastCount = 0;
  for (const escalation of toProcess) {
    const accountId = accountByConv.get(escalation.conversation_id);
    if (!accountId) {
      ctx.log.warn("sdr-escalation-timeout-tick skipped — conversation has no whatsapp account", {
        escalationId: escalation.id,
      });
      continue;
    }

    // Claim first (same idiom as sdr-backstop-tick's guarded UPDATE +
    // affected-row check): the cron body fires via a fire-and-forget
    // net.http_post, so nothing prevents two tick invocations from
    // overlapping. Only the invocation whose UPDATE actually matches a row
    // (urgent_broadcast_at still null) proceeds to notify — the other loses
    // the race and moves on, so overlapping ticks never double-broadcast.
    const { data: claimed, error: claimError } = await admin
      .from("sdr_escalations")
      .update({ urgent_broadcast_at: new Date().toISOString() })
      .eq("id", escalation.id)
      .is("urgent_broadcast_at", null)
      .select("id");
    if (claimError) {
      ctx.log.error("sdr-escalation-timeout-tick escalation update failed", {
        escalationId: escalation.id,
        error: claimError.message,
      });
      continue;
    }
    if (!claimed || claimed.length === 0) continue; // lost the race to a concurrent tick

    // From here the escalation is already claimed. A failure below
    // (eligibility lookup or notification insert) is logged but not
    // retried — future ticks skip anything with urgent_broadcast_at already
    // set — so it is treated as best-effort, same fire-and-forget tradeoff
    // sdr-backstop-tick accepts for its sdr-respond dispatch. Building
    // compensating rollback logic would be disproportionate for this
    // pilot-scope tick.
    const { data: sellerIdRows, error: rpcError } = await admin.rpc(
      "accessible_seller_ids_for_account",
      { p_account_id: accountId },
    );
    if (rpcError) {
      ctx.log.error("sdr-escalation-timeout-tick eligibility lookup failed", {
        escalationId: escalation.id,
        error: rpcError.message,
      });
    } else {
      // PostgREST may return a `setof uuid` either as a scalar array
      // (string[]) or as single-column rows ([{ <col>: string }]) — same
      // ambiguity handled in listAccessibleAccountIds
      // (src/providers/data/impl/supabase/whatsappAccounts.ts): tolerate
      // both without assuming the column name.
      const sellerIds = ((sellerIdRows ?? []) as unknown[]).flatMap((row) => {
        if (typeof row === "string") return [row];
        if (row && typeof row === "object") return [Object.values(row)[0] as string];
        return [];
      });
      const recipients = sellerIds.filter((id) => id !== escalation.assigned_seller_id);

      if (recipients.length > 0) {
        const nowIso = new Date().toISOString();
        const customerName = escalation.context_summary?.customerName ?? "Cliente";
        const ageMinutes = Math.max(
          0,
          Math.floor(
            (Date.now() - new Date(escalation.assigned_at ?? escalation.created_at).getTime()) /
              60_000,
          ),
        );
        const rows = recipients.map((sellerId) => ({
          dedupe_key: `sdr-escalation-broadcast-${escalation.id}-${sellerId}`,
          lifecycle: "event",
          type: "sdr.escalonouSemResposta",
          category: "operational",
          severity: "critical",
          recipient_id: sellerId,
          recipient_type: "seller",
          store_id: storeIdByConv.get(escalation.conversation_id) ?? null,
          title: "Conversa do SDR aguardando atendimento",
          body: `${customerName} aguarda um vendedor há ${ageMinutes} min — ninguém respondeu ainda.`,
          entity_ref: { type: "conversation", id: escalation.conversation_id },
          status: "unread",
          channels: ["inApp"],
          source: "rule",
          created_at: nowIso,
        }));
        const { error: notifyError } = await admin.from("notifications").insert(rows);
        if (notifyError) {
          ctx.log.error("sdr-escalation-timeout-tick notification insert failed", {
            escalationId: escalation.id,
            error: notifyError.message,
          });
        }
      }
    }

    // Gap 2 fix: a 'pending' escalation (no seller was ever assigned) left
    // conversations.is_sdr_active stuck true — nobody is watching it anymore.
    // Runs regardless of the notify outcome above — the escalation is
    // already claimed either way.
    if (escalation.assigned_seller_id === null) {
      await admin
        .from("conversations")
        .update({ is_sdr_active: false })
        .eq("id", escalation.conversation_id)
        .eq("is_sdr_active", true);
    }

    broadcastCount++;
  }

  return json({ broadcast: broadcastCount }, 200);
});
