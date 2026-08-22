import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * conversation-rescue-tick — agendada via pg_cron a cada 1 minuto (spec
 * 2026-07-17, mesmo padrão de sdr-backstop-tick). Três fases por execução,
 * nesta ordem:
 *
 *  1) cancelResolvedRescues — varre TODOS os resgates `broadcasting` (mesmo
 *     de lojas desabilitadas nesse meio-tempo) e cancela qualquer um cuja
 *     conversa já não qualifica mais (o ausente respondeu, a conversa
 *     fechou, ou foi reatribuída por outro caminho) — roda antes das outras
 *     duas fases para que nem broadcastNewRescues nem resolveTimeouts vejam
 *     uma linha stale no mesmo tick.
 *  2) broadcastNewRescues — varre conversas com awaiting_reply_since setado
 *     cujo responsável está ausente (fora da agenda, ou dentro da agenda mas
 *     availability≠online há mais de temporaryAbsenceGraceMinutes) e ainda
 *     sem resgate ativo; cria a linha de broadcast.
 *  3) resolveTimeouts — varre resgates `broadcasting` mais velhos que
 *     forceAssignTimeoutMinutes e força uma atribuição (fallback list online
 *     primeiro, senão qualquer elegível online; se ninguém, mantém
 *     broadcasting — o sub-projeto A cobre esse extremo via idle-alerts).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";
import { requiredEnv } from "../_shared/env.ts";
import { HttpError, json } from "../_shared/http.ts";
import { servePost, type RequestContext } from "../_shared/serve.ts";
import { createSecretResolver } from "../_shared/secrets.ts";
import { verifyWorkerSecret } from "../_shared/workerAuth.ts";
import { isWithinWorkSchedule } from "../_shared/access/workSchedule.ts";
import { resolveAccessRecipients } from "../_shared/access/accessRecipients.ts";
import { determineAbsence } from "../_shared/conversation-rescue/engine/determineAbsence.ts";
import { pickFallbackSeller } from "../_shared/conversation-rescue/engine/pickFallbackSeller.ts";
import {
  isWithinRescueCooldown,
  RESCUE_REBROADCAST_COOLDOWN_MINUTES,
  type IRescueCooldownEntry,
} from "../_shared/conversation-rescue/engine/rescueCooldown.ts";
import { isSameWaitEpoch } from "../_shared/conversation-rescue/engine/waitEpoch.ts";
import {
  MAX_BROADCASTS_PER_TICK,
  MAX_FORCED_ASSIGNMENTS_PER_TICK,
} from "../_shared/conversation-rescue/engine/tickLimits.ts";

const WORKER_SECRET_NAME = "CONVERSATION_RESCUE_WORKER_SECRET";

interface ISellerRow {
  id: string;
  store_id: string;
  auth_user_id: string | null;
  availability: "online" | "ausente" | "ocupado" | "offline";
  active: boolean;
  work_schedule: unknown;
  schedule_overrides: unknown;
}

interface IConversationRow {
  id: string;
  store_id: string;
  whatsapp_account_id: string | null;
  assigned_seller_id: string;
  awaiting_reply_since: string;
  customer_id: string | null;
  lead_id: string | null;
}

async function fetchProfileRolesByAuthUserId(
  admin: ReturnType<typeof createClient>,
  authUserIds: string[],
): Promise<Map<string, string>> {
  if (authUserIds.length === 0) return new Map();
  const { data } = await admin
    .from("profiles")
    .select("auth_user_id, role")
    .in("auth_user_id", authUserIds);
  const map = new Map<string, string>();
  for (const row of (data ?? []) as Array<{ auth_user_id: string; role: string }>) {
    map.set(row.auth_user_id, row.role);
  }
  return map;
}

/** Sellers eligible to receive the broadcast for `accountId`, excluding `excludeSellerId`. */
async function resolveEligiblePool(
  admin: ReturnType<typeof createClient>,
  storeId: string,
  accountId: string,
  excludeSellerId: string,
  now: Date,
): Promise<string[]> {
  const { data: rulesData } = await admin
    .from("whatsapp_account_access_rules")
    .select("kind, target_value")
    .eq("whatsapp_account_id", accountId);
  // resolveAccessRecipients expects camelCase `targetValue` — the DB row is
  // snake_case `target_value`; map explicitly, never cast-and-hope.
  const rules = ((rulesData ?? []) as Array<{ kind: string; target_value: string }>).map((r) => ({
    kind: r.kind,
    targetValue: r.target_value,
  }));

  const { data: sellersData } = await admin
    .from("sellers")
    .select("id, store_id, auth_user_id, availability, active, work_schedule, schedule_overrides")
    .eq("store_id", storeId)
    .eq("active", true);
  const sellers = (sellersData ?? []) as ISellerRow[];

  const authUserIds = sellers.map((s) => s.auth_user_id).filter((id): id is string => id !== null);
  const rolesByAuthUserId = await fetchProfileRolesByAuthUserId(admin, authUserIds);

  const sellersLike = sellers.map((s) => ({
    id: s.id,
    role: s.auth_user_id ? (rolesByAuthUserId.get(s.auth_user_id) ?? "") : "",
    storeId: s.store_id,
  }));
  const ruleRecipients = resolveAccessRecipients(rules, sellersLike);

  const eligibleIds = new Set<string>();
  for (const s of sellers) {
    if (s.id === excludeSellerId) continue;
    const role = s.auth_user_id ? rolesByAuthUserId.get(s.auth_user_id) : undefined;
    const isStaffBypass = role === "owner" || role === "manager";
    if (!isStaffBypass && !ruleRecipients.has(s.id)) continue;
    if (s.availability !== "online") continue;
    const scheduleSource = {
      workSchedule: (s.work_schedule ?? []) as never,
      scheduleOverrides: (s.schedule_overrides ?? []) as never,
    };
    if (!isWithinWorkSchedule(scheduleSource, now)) continue;
    eligibleIds.add(s.id);
  }
  return [...eligibleIds];
}

async function cancelResolvedRescues(
  admin: ReturnType<typeof createClient>,
  now: Date,
  ctx: RequestContext,
): Promise<number> {
  const { data: broadcasting, error: broadcastingError } = await admin
    .from("conversation_rescues")
    .select("id, conversation_id, store_id, absent_seller_id, broadcast_at")
    .eq("status", "broadcasting");
  let cancelled = 0;
  if (broadcastingError) {
    // A read blip must not read as "nothing to cancel" — that silently skips
    // the kill-switch for a whole tick. Log and retry next tick.
    ctx.log.error("conversation-rescue-tick broadcasting fetch failed", {
      error: broadcastingError.message,
    });
    return 0;
  }
  if (!broadcasting || broadcasting.length === 0) return 0;

  // Kill-switch (review 2026-07-18): disabling the store toggle must retire
  // its live broadcasts too — otherwise they stay visible/claimable forever
  // (the panel and the claim RPC never consult the toggle) and mass-force on
  // re-enable via resolveTimeouts.
  // Fail SAFE on a fetch error (review round 2): with no store data we cannot
  // tell enabled from disabled — a null result must NOT read as "every store
  // is disabled" and mass-cancel the platform; skip the classification and
  // retry next tick.
  const { data: storeRows, error: storesError } = await admin
    .from("stores")
    .select("id, settings");
  if (storesError) {
    ctx.log.error("conversation-rescue-tick stores fetch failed", {
      error: storesError.message,
    });
  }
  // `null` data without an error is just as inconclusive as an error: an empty
  // Set is truthy and would classify every live broadcast as store_disabled.
  const enabledStoreIds = storesError || !storeRows
    ? null
    : new Set(
        ((storeRows ?? []) as Array<{ id: string; settings: Record<string, unknown> | null }>)
          .filter((s) => {
            const cfg = (s.settings?.conversationRescue ?? {}) as { enabled?: unknown };
            // Mirror the SQL filter of phases 2/3 (settings->conversationRescue->>enabled
            // = 'true'), which matches BOTH jsonb true and the string "true" — a
            // narrower check here would make phase 1 cancel what phase 2 creates.
            return cfg.enabled === true || cfg.enabled === "true";
          })
          .map((s) => s.id),
      );

  const cancel = async (rescueId: string, reason: string): Promise<boolean> => {
    const { error } = await admin
      .from("conversation_rescues")
      .update({ status: "cancelled", cancelled_reason: reason })
      .eq("id", rescueId)
      .eq("status", "broadcasting");
    if (error) {
      ctx.log.error("conversation-rescue-tick cancel failed", {
        rescueId,
        reason,
        error: error.message,
      });
      return false;
    }
    return true;
  };

  for (const rescue of broadcasting as Array<{
    id: string;
    conversation_id: string;
    store_id: string;
    absent_seller_id: string;
    broadcast_at: string;
  }>) {
    if (enabledStoreIds && !enabledStoreIds.has(rescue.store_id)) {
      if (await cancel(rescue.id, "store_disabled")) cancelled++;
      continue;
    }

    const { data: conv, error: convError } = await admin
      .from("conversations")
      .select("assigned_seller_id, awaiting_reply_since, status")
      .eq("id", rescue.conversation_id)
      .maybeSingle();
    if (convError) {
      // Transient read failure ≠ "conversation gone" — cancelling here would
      // be destructive on a blip; retry next tick (review round 2).
      ctx.log.error("conversation-rescue-tick liveness fetch failed", {
        rescueId: rescue.id,
        error: convError.message,
      });
      continue;
    }
    const c = conv as {
      assigned_seller_id: string | null;
      awaiting_reply_since: string | null;
      status: string;
    } | null;
    const stillValid =
      !!c &&
      c.assigned_seller_id === rescue.absent_seller_id &&
      c.awaiting_reply_since !== null &&
      // Same wait EPOCH the broadcast was created for. The absent seller may
      // have replied (trigger clears the clock) and the client written again
      // — a non-null field alone would read that brand-new wait as "still the
      // same one" and keep a stale row alive for resolveTimeouts to force.
      isSameWaitEpoch(c.awaiting_reply_since, rescue.broadcast_at) &&
      ["aguardando", "em_andamento", "aguardando_cliente"].includes(c.status);
    if (stillValid) continue;

    if (await cancel(rescue.id, "conversation_no_longer_waiting")) cancelled++;
  }
  return cancelled;
}

async function broadcastNewRescues(
  admin: ReturnType<typeof createClient>,
  now: Date,
  ctx: RequestContext,
): Promise<number> {
  const { data: stores } = await admin
    .from("stores")
    .select("id, settings")
    .not("settings->conversationRescue->>enabled", "is", null)
    .eq("settings->conversationRescue->>enabled", "true");
  let created = 0;

  for (const store of (stores ?? []) as Array<{ id: string; settings: Record<string, unknown> }>) {
    const cfg = (store.settings.conversationRescue ?? {}) as {
      temporaryAbsenceGraceMinutes?: number;
      maxClientWaitHours?: number;
    };
    const graceMinutes = cfg.temporaryAbsenceGraceMinutes ?? 15;
    const maxClientWaitHours = cfg.maxClientWaitHours ?? 24;

    const { data: activeRescues } = await admin
      .from("conversation_rescues")
      .select("conversation_id")
      .eq("store_id", store.id)
      .eq("status", "broadcasting");
    const alreadyBroadcasting = new Set(
      ((activeRescues ?? []) as Array<{ conversation_id: string }>).map((r) => r.conversation_id),
    );

    // Re-broadcast cooldown (incident 2026-07-18): a conversation whose rescue
    // resolved recently must not re-qualify on the next tick just because the
    // claimer hasn't replied yet. The fetch is anchored on the SAME clocks the
    // pure helper uses (claimed_at/forced_at/created_at, whichever is newest)
    // — anchoring on created_at alone dropped rescues that sat broadcasting
    // longer than the window before resolving (review 2026-07-18).
    const cooldownFetchCutoff = new Date(
      now.getTime() - RESCUE_REBROADCAST_COOLDOWN_MINUTES * 60_000,
    ).toISOString();
    const { data: recentResolved, error: cooldownError } = await admin
      .from("conversation_rescues")
      .select("conversation_id, claimed_at, forced_at, created_at")
      .eq("store_id", store.id)
      .neq("status", "broadcasting")
      .or(
        `claimed_at.gte.${cooldownFetchCutoff},forced_at.gte.${cooldownFetchCutoff},created_at.gte.${cooldownFetchCutoff}`,
      );
    if (cooldownError) {
      // Without this list the cooldown silently suppresses nothing and the
      // re-broadcast loop reopens. Skip the store; the next tick retries.
      ctx.log.error("conversation-rescue-tick cooldown fetch failed", {
        storeId: store.id,
        error: cooldownError.message,
      });
      continue;
    }
    const resolvedByConversation = new Map<string, IRescueCooldownEntry[]>();
    for (const row of (recentResolved ?? []) as Array<{
      conversation_id: string;
      claimed_at: string | null;
      forced_at: string | null;
      created_at: string;
    }>) {
      const list = resolvedByConversation.get(row.conversation_id) ?? [];
      list.push({ claimedAt: row.claimed_at, forcedAt: row.forced_at, createdAt: row.created_at });
      resolvedByConversation.set(row.conversation_id, list);
    }

    // Push the max-wait window into SQL. It used to be applied only inside
    // determineAbsence, i.e. AFTER a per-conversation `sellers` read — most
    // candidates were fetched just to be discarded one round-trip later.
    const waitWindowCutoff = new Date(
      now.getTime() - maxClientWaitHours * 3_600_000,
    ).toISOString();
    const { data: convData } = await admin
      .from("conversations")
      .select("id, store_id, whatsapp_account_id, assigned_seller_id, awaiting_reply_since, customer_id, lead_id")
      .eq("store_id", store.id)
      .not("assigned_seller_id", "is", null)
      .not("awaiting_reply_since", "is", null)
      .gte("awaiting_reply_since", waitWindowCutoff)
      .in("status", ["aguardando", "em_andamento", "aguardando_cliente"])
      // Oldest wait first, so a capped tick is fair instead of arbitrary.
      .order("awaiting_reply_since", { ascending: true })
      .limit(MAX_BROADCASTS_PER_TICK * 20);
    const conversations = (convData ?? []) as IConversationRow[];

    for (const conv of conversations) {
      if (created >= MAX_BROADCASTS_PER_TICK) {
        ctx.log.info("conversation-rescue-tick broadcast cap reached", {
          storeId: store.id,
          cap: MAX_BROADCASTS_PER_TICK,
        });
        break;
      }
      if (alreadyBroadcasting.has(conv.id)) continue;
      if (!conv.whatsapp_account_id) continue;
      if (
        isWithinRescueCooldown(
          resolvedByConversation.get(conv.id) ?? [],
          now,
          RESCUE_REBROADCAST_COOLDOWN_MINUTES,
          conv.awaiting_reply_since,
        )
      ) {
        continue;
      }

      const { data: sellerData } = await admin
        .from("sellers")
        .select("id, store_id, auth_user_id, availability, active, work_schedule, schedule_overrides")
        .eq("id", conv.assigned_seller_id)
        .maybeSingle();
      const seller = sellerData as ISellerRow | null;
      // Symmetry with resolveEligiblePool, which only ever routes to
      // `active` sellers: a deactivated owner's book would otherwise be a
      // permanent candidate source for someone who can never reply.
      if (!seller || seller.active === false) continue;

      const scheduleSource = {
        workSchedule: (seller.work_schedule ?? []) as never,
        scheduleOverrides: (seller.schedule_overrides ?? []) as never,
      };
      const isWithinSchedule = isWithinWorkSchedule(scheduleSource, now);
      const absenceKind = determineAbsence({
        isWithinSchedule,
        availability: seller.availability,
        awaitingReplySince: conv.awaiting_reply_since,
        now,
        temporaryAbsenceGraceMinutes: graceMinutes,
        maxClientWaitHours,
      });
      if (!absenceKind) continue;

      let contactName = "Contato";
      if (conv.customer_id) {
        const { data: customer } = await admin
          .from("customers")
          .select("nome_fantasia, full_name")
          .eq("id", conv.customer_id)
          .maybeSingle();
        const c = customer as { nome_fantasia: string | null; full_name: string | null } | null;
        contactName = c?.nome_fantasia || c?.full_name || contactName;
      } else if (conv.lead_id) {
        const { data: lead } = await admin
          .from("leads")
          .select("name")
          .eq("id", conv.lead_id)
          .maybeSingle();
        contactName = (lead as { name: string } | null)?.name ?? contactName;
      }

      const { data: lastInbound } = await admin
        .from("messages")
        .select("text")
        .eq("conversation_id", conv.id)
        .eq("direction", "in")
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const { error: insertError } = await admin.from("conversation_rescues").insert({
        conversation_id: conv.id,
        store_id: conv.store_id,
        whatsapp_account_id: conv.whatsapp_account_id,
        absent_seller_id: conv.assigned_seller_id,
        absence_kind: absenceKind,
        contact_name: contactName,
        last_inbound_preview: (lastInbound as { text: string } | null)?.text ?? null,
      });
      if (!insertError) {
        created++;
      } else if (insertError.code !== "23505") {
        // 23505 = unique_violation — another concurrent tick already broadcast
        // this conversation; expected under overlapping invocations, not an error.
        ctx.log.error("conversation-rescue-tick broadcast insert failed", {
          conversationId: conv.id,
          error: insertError.message,
        });
      }
    }
  }
  return created;
}

async function resolveTimeouts(
  admin: ReturnType<typeof createClient>,
  now: Date,
  ctx: RequestContext,
): Promise<number> {
  const { data: stores } = await admin
    .from("stores")
    .select("id, settings")
    .not("settings->conversationRescue->>enabled", "is", null)
    .eq("settings->conversationRescue->>enabled", "true");
  let forced = 0;

  for (const store of (stores ?? []) as Array<{ id: string; settings: Record<string, unknown> }>) {
    const cfg = (store.settings.conversationRescue ?? {}) as {
      forceAssignTimeoutMinutes?: number;
      fallbackSellerIds?: string[];
    };
    const timeoutMinutes = cfg.forceAssignTimeoutMinutes ?? 5;
    const fallbackSellerIds = cfg.fallbackSellerIds ?? [];
    const cutoff = new Date(now.getTime() - timeoutMinutes * 60_000).toISOString();

    const { data: stale } = await admin
      .from("conversation_rescues")
      .select("id, conversation_id, store_id, whatsapp_account_id, absent_seller_id, broadcast_at")
      .eq("store_id", store.id)
      .eq("status", "broadcasting")
      .lte("broadcast_at", cutoff);

    for (const rescue of (stale ?? []) as Array<{
      id: string;
      conversation_id: string;
      store_id: string;
      whatsapp_account_id: string | null;
      absent_seller_id: string;
      broadcast_at: string;
    }>) {
      if (forced >= MAX_FORCED_ASSIGNMENTS_PER_TICK) {
        ctx.log.info("conversation-rescue-tick force cap reached", {
          storeId: store.id,
          cap: MAX_FORCED_ASSIGNMENTS_PER_TICK,
        });
        break;
      }
      if (!rescue.whatsapp_account_id) continue;

      // Re-validate BEFORE forcing (review 2026-07-18): the row was qualified
      // at broadcast time, but forcing is the irreversible step — if the
      // conversation moved on, or the absent seller is genuinely PRESENT
      // again (online AND within schedule), cancel instead of reassigning.
      // Deliberately NOT re-running the grace/max-window clauses here: a
      // broadcasting row was fresh when created, and a rescue that aged past
      // the window while nobody was online (weekend) must still force on the
      // first tick with people available — cancelling it would strand the
      // client, since broadcastNewRescues can never recreate a too-old wait
      // (review round 2).
      const { data: convRow, error: convFetchError } = await admin
        .from("conversations")
        .select("assigned_seller_id, awaiting_reply_since, status")
        .eq("id", rescue.conversation_id)
        .maybeSingle();
      if (convFetchError) {
        // Transient read failure ≠ "conversation gone" — retry next tick.
        ctx.log.error("conversation-rescue-tick pre-force conversation fetch failed", {
          rescueId: rescue.id,
          error: convFetchError.message,
        });
        continue;
      }
      const conv = convRow as {
        assigned_seller_id: string | null;
        awaiting_reply_since: string | null;
        status: string;
      } | null;
      let stillQualifies =
        !!conv &&
        conv.assigned_seller_id === rescue.absent_seller_id &&
        conv.awaiting_reply_since !== null &&
        // Must be the SAME wait this row was broadcast for. Forcing is the
        // irreversible step: if the absent seller replied and the client wrote
        // again, a non-null clock alone would hand the conversation to someone
        // else seconds after the original owner answered.
        isSameWaitEpoch(conv.awaiting_reply_since, rescue.broadcast_at) &&
        ["aguardando", "em_andamento", "aguardando_cliente"].includes(conv.status);
      if (stillQualifies) {
        const { data: sellerRow, error: sellerFetchError } = await admin
          .from("sellers")
          .select("availability, work_schedule, schedule_overrides")
          .eq("id", rescue.absent_seller_id)
          .maybeSingle();
        if (sellerFetchError) {
          ctx.log.error("conversation-rescue-tick pre-force seller fetch failed", {
            rescueId: rescue.id,
            error: sellerFetchError.message,
          });
          continue;
        }
        const seller = sellerRow as Pick<
          ISellerRow,
          "availability" | "work_schedule" | "schedule_overrides"
        > | null;
        if (!seller) {
          stillQualifies = false;
        } else {
          const isWithinSchedule = isWithinWorkSchedule(
            {
              workSchedule: (seller.work_schedule ?? []) as never,
              scheduleOverrides: (seller.schedule_overrides ?? []) as never,
            },
            now,
          );
          const sellerPresent = isWithinSchedule && seller.availability === "online";
          stillQualifies = !sellerPresent;
        }
      }
      if (!stillQualifies) {
        const { error: cancelErr } = await admin
          .from("conversation_rescues")
          .update({ status: "cancelled", cancelled_reason: "no_longer_qualifies_at_force" })
          .eq("id", rescue.id)
          .eq("status", "broadcasting");
        if (cancelErr) {
          ctx.log.error("conversation-rescue-tick pre-force cancel failed", {
            rescueId: rescue.id,
            error: cancelErr.message,
          });
        }
        continue;
      }

      const eligible = await resolveEligiblePool(
        admin,
        rescue.store_id,
        rescue.whatsapp_account_id,
        rescue.absent_seller_id,
        now,
      );
      const fallbackOnline = fallbackSellerIds.filter((id) => eligible.includes(id));
      const pool = fallbackOnline.length > 0 ? fallbackOnline : eligible;
      if (pool.length === 0) continue; // nobody online anywhere — stays broadcasting

      const seed = `${rescue.id}-${rescue.broadcast_at}`;
      const chosen = pickFallbackSeller(pool, seed);
      if (!chosen) continue;

      const { data: updated, error: updErr } = await admin
        .from("conversation_rescues")
        .update({ status: "forced", forced_seller_id: chosen, forced_at: now.toISOString() })
        .eq("id", rescue.id)
        .eq("status", "broadcasting") // idempotency guard against a concurrent tick
        .select("id");
      if (updErr) {
        ctx.log.error("conversation-rescue-tick force-assign update failed", {
          rescueId: rescue.id,
          error: updErr.message,
        });
        continue;
      }
      if (!updated || updated.length === 0) continue; // lost the race to a concurrent tick — don't double-fire

      const { error: convUpdErr } = await admin
        .from("conversations")
        .update({ assigned_seller_id: chosen })
        .eq("id", rescue.conversation_id);
      if (convUpdErr) {
        ctx.log.error("conversation-rescue-tick conversation reassignment failed", {
          rescueId: rescue.id,
          conversationId: rescue.conversation_id,
          error: convUpdErr.message,
        });
      }

      const { error: auditErr } = await admin.from("audit_logs").insert({
        store_id: rescue.store_id,
        actor_id: chosen,
        action: "conversation_rescue_forced",
        resource: "conversation",
        resource_id: rescue.conversation_id,
        after: { rescueId: rescue.id },
      });
      if (auditErr) {
        ctx.log.error("conversation-rescue-tick audit log insert failed", {
          rescueId: rescue.id,
          error: auditErr.message,
        });
      }
      forced++;
    }
  }
  return forced;
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

  const now = new Date();
  const cancelled = await cancelResolvedRescues(admin, now, ctx);
  const created = await broadcastNewRescues(admin, now, ctx);
  const forced = await resolveTimeouts(admin, now, ctx);
  ctx.log.info("conversation-rescue-tick done", { cancelled, created, forced });
  return json({ cancelled, created, forced }, 200);
});
