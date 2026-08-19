/**
 * waha-webhook — public inbound endpoint for WAHA session events.
 *
 * FULLY ISOLATED: does not import `_shared/whatsapp/webhook/core.ts`,
 * `_shared/whatsapp/build.ts` or `_shared/whatsapp/send/core.ts`, nor
 * anything from `whatsapp-webhook/`. Only generic platform primitives
 * (_shared/http.ts, _shared/secrets.ts, _shared/env.ts), the shared
 * engine-agnostic `_shared/whatsapp/messageStatus.ts` ranking, and the
 * self-contained `_shared/whatsapp/waha/*` engine are used. Fail-closed on a
 * bad/missing HMAC signature — no DB write happens before it's verified.
 *
 * Handles five event kinds:
 *   - "message": an inbound customer message (persisted with
 *     reuse-or-reopen-or-create conversation semantics).
 *   - "message.any": WAHA's (GOWS engine) only channel for `fromMe: true`
 *     messages — someone replied straight from the paired phone, outside the
 *     platform. Plain "message" never carries these. Mirrored with
 *     open-only-lookup semantics so it never REOPENS a closed conversation —
 *     though within the echo-continuity window (default 24h, per-store
 *     setting) it may APPEND to a recently-`resolvida` thread without
 *     changing its status (decision 2026-07-23, doc §7 item 3);
 *     any "message.any" envelope that turns out NOT to be an echo (i.e.
 *     genuine inbound, already covered by "message") is ignored to avoid
 *     double-processing. A duplicate echo (app-sent message already
 *     persisted) still applies any ack level embedded in the payload before
 *     bailing out — see applyWahaAckToMessage.
 *   Both message paths land in the same conversations/messages tables the
 *   rest of the Inbox reads, with a separate media download step. Mirrors the
 *   real `whatsapp-webhook` function's tested contract (see
 *   _shared/whatsapp/webhook/core.ts).
 *   - "session.status": updates whatsapp_accounts.status.
 *   - "message.ack": delivery/read status transition for a previously sent
 *     outbound message — see applyWahaAckToMessage (added 2026-07-15;
 *     previously deferred — see
 *     docs/superpowers/specs/2026-07-15-waha-ack-and-number-check-design.md).
 *   - "message.reaction": a 👍/❤️/etc. attached to an already-persisted
 *     message (or "" to remove one) — patches messages.reactions in place. A
 *     genuine customer reaction (not fromMe, not a removal) also counts as an
 *     interaction: it bumps the conversation and marks it unread via the
 *     atomic RPC waha_reaction_touch — UNLESS the conversation is closed
 *     (resolvida/arquivada), which the RPC leaves untouched by owner decision
 *     (2026-07-24): a reaction on a closed conversation is almost always a
 *     thank-you, not a new demand.
 * Any other envelope event is acknowledged (200) and ignored.
 *
 * Spec: docs/superpowers/specs/2026-07-10-waha-whatsapp-integration-design.md
 *       docs/superpowers/specs/2026-07-15-waha-ack-and-number-check-design.md
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";
import { requiredEnv } from "../_shared/env.ts";
import { json } from "../_shared/http.ts";
import { createSecretResolver } from "../_shared/secrets.ts";
import { mapWahaAckToStatus, parseWahaAckPayload } from "../_shared/whatsapp/waha/ack.ts";
import { downloadWahaMedia } from "../_shared/whatsapp/waha/media.ts";
import { parseWahaMessageEvent } from "../_shared/whatsapp/waha/parser.ts";
import { applyReaction, parseWahaReactionEvent } from "../_shared/whatsapp/waha/reaction.ts";
import { verifyWahaHmac } from "../_shared/whatsapp/waha/hmac.ts";
import { wahaStateToAccountStatus } from "../_shared/whatsapp/waha/constants.ts";
import { getWahaContactName, resolveWahaLid } from "../_shared/whatsapp/waha/contacts.ts";
import { buildWahaEventKey } from "../_shared/whatsapp/waha/eventKey.ts";
import { statusAdvances, type DeliveryStatus } from "../_shared/whatsapp/messageStatus.ts";
import {
  echoContinuityCutoffIso,
  resolveEchoContinuityWindowHours,
} from "../_shared/whatsapp/echoContinuity.ts";
import { phoneDigitsMatchBr } from "../_shared/whatsapp/phoneBr.ts";
import { resolveReplyRef } from "../_shared/replyRef.ts";
import { logWebhookDelivery } from "../_shared/webhookDeliveryLog.ts";
import { runInBackground } from "../_shared/backgroundTask.ts";
import { transcribeMessageAudio } from "../_shared/ai/transcribeAudio.ts";

interface IWahaEnvelope {
  id?: string;
  event?: string;
  session?: string;
  payload?: unknown;
}

const CLOSED_CONVERSATION_STATUSES = ["resolvida", "arquivada"];

// Tagged transient-DB failure thrown by helpers deep in the call tree
// (contact resolution, lead upserts). The global catch converts it into a 503
// WITHOUT the idempotency mark so WAHA redelivers (fail-closed, PR #357 item
// 2); every other error keeps the legacy 200 "error-logged" contract.
class TransientDbError extends Error {}

// Fallback pipeline stage when the store has none configured yet — mirrors the
// app-level default (src/mocks/data/platform.ts) and the reference
// whatsapp-webhook's DEFAULT_FIRST_STAGE. Used by the lead helpers below.
const DEFAULT_FIRST_STAGE = { id: "stage-novo", name: "Novo", order: 1, color: "#5b6b7a" };

function extForMimetype(mimetype: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "audio/ogg": "ogg",
    "audio/mpeg": "mp3",
    "video/mp4": "mp4",
    "application/pdf": "pdf",
  };
  return map[mimetype] ?? "bin";
}

Deno.serve(async (req) => {
  const startedAt = Date.now();
  const admin = createClient(
    requiredEnv("SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: { persistSession: false },
    },
  );

  // Every exit funnels through here (mirrors whatsapp-webhook's respond()).
  // `sessionForLog`/`accountIdForLog` are set as soon as they're known —
  // early exits (before the session is resolved) simply log without them.
  let sessionForLog: string | undefined;
  let accountIdForLog: string | null = null;
  const respond = (
    res: Response,
    meta?: {
      outcome?: import("../_shared/webhookDeliveryLog.ts").WebhookDeliveryOutcome;
      eventType?: string | null;
      requestPayload?: unknown;
      errorMessage?: string | null;
    },
  ) => {
    runInBackground(
      logWebhookDelivery(admin, {
        integrationName: "whatsapp_waha",
        accountId: accountIdForLog,
        eventType: meta?.eventType ?? sessionForLog ?? null,
        endpoint: "/waha-webhook",
        httpStatus: res.status,
        outcome: meta?.outcome ?? (res.status >= 400 ? "rejected" : "processed"),
        errorMessage: meta?.errorMessage ?? null,
        latencyMs: Date.now() - startedAt,
        requestPayload: meta?.requestPayload ?? null,
        traceId: null,
      }),
    );
    return res;
  };

  if (req.method !== "POST") return respond(json({ error: "method not allowed" }, 405));

  const resolveSecret = createSecretResolver(admin);

  const rawBody = await req.text();
  let envelope: IWahaEnvelope;
  try {
    envelope = JSON.parse(rawBody) as IWahaEnvelope;
  } catch {
    return respond(json({ error: "invalid JSON" }, 400), { requestPayload: rawBody });
  }
  if (!envelope.session || !envelope.event) {
    return respond(json({ error: "missing session/event" }, 400), { requestPayload: envelope });
  }
  sessionForLog = envelope.event;

  // ===== Account resolution (by sessionName) ================================
  const { data: accountRow } = await admin
    .from("whatsapp_accounts")
    .select("id, store_id, provider_config, waha_server_id")
    .eq("provider", "waha")
    .eq("provider_config->>sessionName", envelope.session)
    .maybeSingle();
  if (!accountRow) {
    console.warn(
      JSON.stringify({
        level: "warn",
        msg: "waha webhook: unknown session",
        session: envelope.session,
      }),
    );
    return respond(json({ error: "unknown session" }, 401), { requestPayload: envelope });
  }
  accountIdForLog = accountRow.id as string;

  const { data: server } = await admin
    .from("waha_servers")
    .select("base_url, api_key_ref, webhook_hmac_ref")
    .eq("id", accountRow.waha_server_id as string)
    .maybeSingle();
  if (!server?.webhook_hmac_ref) {
    console.warn(
      JSON.stringify({
        level: "warn",
        msg: "waha webhook: server missing hmac ref",
        session: envelope.session,
      }),
    );
    return respond(json({ error: "server not configured" }, 401), { requestPayload: envelope });
  }

  // Server API key, resolved lazily and at most once per invocation — the
  // hot path (text message from a known customer) never pays the Vault read.
  // `resolveSecret` returns `string | undefined`; coalesce to null so the
  // undefined sentinel below means "not fetched yet" and a missing key
  // latches as null (memoized) instead of re-fetching forever.
  let apiKeyMemo: string | null | undefined;
  async function getApiKey(): Promise<string | null> {
    if (apiKeyMemo === undefined) {
      apiKeyMemo = (await resolveSecret(String(server.api_key_ref))) ?? null;
    }
    return apiKeyMemo;
  }

  // ===== HMAC verification (fail-closed, BEFORE any DB write below) =========
  const hmacKey = await resolveSecret(String(server.webhook_hmac_ref));
  if (!hmacKey)
    return respond(json({ error: "server not configured" }, 401), { requestPayload: envelope });

  const signature = req.headers.get("X-Webhook-Hmac");
  const valid = await verifyWahaHmac(rawBody, hmacKey, signature);
  if (!valid) {
    console.warn(
      JSON.stringify({
        level: "warn",
        msg: "waha webhook: invalid HMAC",
        session: envelope.session,
      }),
    );
    return respond(json({ error: "invalid signature" }, 401), {
      outcome: "rejected",
      requestPayload: envelope,
    });
  }

  try {
    // ===== Idempotency — CHECK is early (read-only), MARK is deferred =========
    // Scoped by account id, not just provider — the "eco de mídia" lesson: an
    // unscoped key lets two sessions racing on the same envelope id swallow
    // each other's event. ALSO scoped by event type (2026-07-15 incident): WAHA
    // assigns the SAME envelope id to the `message` and `message.any`
    // deliveries reporting one underlying message, and the two arrive as
    // separate concurrent requests — an unscoped key let whichever won the
    // race mark the other's key processed too, silently dropping the
    // `message` delivery (the only one that persists the row). See
    // buildWahaEventKey.
    //
    // The check (a SELECT) still happens here, before any processing, so a
    // genuine WAHA retry of an event we already fully handled is rejected
    // fast. But the MARK (the actual processed_events INSERT) is deferred to
    // the point where the corresponding downstream write has actually landed
    // — see markProcessed() calls below. If it were inserted here instead (as
    // it used to be), a transient failure in the customer/conversation/message
    // inserts further down would still leave the row in processed_events,
    // permanently blocking any WAHA retry of that event from ever being
    // reprocessed. Mirrors the isProcessed()/markProcessed() split in the
    // reference `_shared/whatsapp/webhook/core.ts` (not imported here).
    const eventKey = buildWahaEventKey({
      accountId: accountRow.id as string,
      event: envelope.event,
      envelopeId: envelope.id ?? crypto.randomUUID(),
    });
    const { data: alreadyProcessed } = await admin
      .from("processed_events")
      .select("event_key")
      .eq("event_key", eventKey)
      .maybeSingle();
    if (alreadyProcessed) {
      return respond(json({ ok: true, duplicate: true }, 200), {
        outcome: "duplicate",
        requestPayload: envelope,
      });
    }

    // Best-effort bookkeeping write — called only after the real work it
    // guards has succeeded, so its own failure must never fail the response
    // (the work already landed; at worst a duplicate gets reprocessed later).
    async function markProcessed(): Promise<void> {
      const { error } = await admin
        .from("processed_events")
        .upsert({ event_key: eventKey, trace_id: null }, { onConflict: "event_key" });
      if (error) {
        console.warn(
          JSON.stringify({
            level: "warn",
            msg: "waha webhook: mark-processed failed",
            error: error.message,
          }),
        );
      }
    }

    // Fail CLOSED on transient DB failures (2026-07-23, PR #357 item 2): a
    // discarded lookup/insert error used to read as "row not found" and fail
    // open into a duplicate conversation INSERT — or into a silent 200 that
    // dropped the message. A 503 WITHOUT markProcessed() makes WAHA redeliver
    // the event; the deferred idempotency mark guarantees the retry
    // reprocesses cleanly.
    function transientDbFailure(stage: string, error: { message: string }): Response {
      console.error(
        JSON.stringify({
          level: "error",
          msg: `waha webhook: ${stage} failed`,
          error: error.message,
        }),
      );
      return respond(json({ error: "transient-db-error", stage }, 503), {
        outcome: "error",
        errorMessage: `${stage}: ${error.message}`,
        requestPayload: envelope,
      });
    }

    // Shared phone→customer lookup (suffix pre-filter + tolerant match via
    // phoneDigitsMatchBr — phone formatting varies in the base: +55...,
    // (55) 9..., etc.; a stored number may also be missing the 9th digit).
    // Used by both the inbound-message and outbound-echo paths below.
    //
    // adoptCanonical: when the match was tolerant (stored digits ≠ wire digits)
    // and the wire number is a REAL pn (never an unresolved-lid placeholder),
    // the customer adopts the wire number — WhatsApp's own canonical identity
    // (usync-normalized). This self-heals stored variants (missing DDI 55,
    // 9th-digit divergence) so future sends dial the canonical JID instead of
    // failing with an opaque GOWS 500 (2026-07-17 incident: RODAWE + 802
    // DINTEC customers reconciled by batch; this keeps the base from drifting
    // again). Best-effort: an adoption failure never blocks the message.
    async function findCustomerByPhone(
      phoneDigits: string,
      opts?: { adoptCanonical?: boolean },
    ): Promise<string | undefined> {
      const { data: candidates, error: candidatesErr } = await admin
        .from("customers")
        .select("id, phone")
        .eq("store_id", accountRow.store_id as string)
        .like("phone", `%${phoneDigits.slice(-8)}`);
      // Fail CLOSED: a discarded error here read as "unknown number" and fell
      // through to lead creation — a duplicate anchor the unique index cannot
      // veto (different anchor column).
      if (candidatesErr) throw new TransientDbError(`findCustomerByPhone: ${candidatesErr.message}`);
      const match = (candidates ?? []).find((c) =>
        phoneDigitsMatchBr(String(c.phone).replace(/\D/g, ""), phoneDigits),
      );
      if (!match) return undefined;
      const storedDigits = String(match.phone).replace(/\D/g, "");
      if (opts?.adoptCanonical && phoneDigits && storedDigits !== phoneDigits) {
        const { error: adoptError } = await admin
          .from("customers")
          .update({ phone: `+${phoneDigits}` })
          .eq("id", match.id as string);
        if (adoptError) {
          console.warn(
            JSON.stringify({
              level: "warn",
              msg: "waha webhook: canonical phone adoption failed",
              customerId: match.id,
              error: adoptError.message,
            }),
          );
        } else {
          console.log(
            JSON.stringify({
              level: "info",
              msg: "waha webhook: customer adopted canonical phone",
              customerId: match.id,
              from: String(match.phone),
              to: `+${phoneDigits}`,
            }),
          );
        }
      }
      return match.id as string;
    }

    // ===== Lead resolution (Funnel Frente 3) =================================
    // Mirrored — DELIBERATELY, never imported — from the reference
    // whatsapp-webhook adapter (`createLead`/`reopenLostLead`/
    // `findOpenConversationForLead`, index.ts L340-385; helpers `assignNext-
    // FromRotation`/`getFirstPipelineStage`/`DEFAULT_FIRST_STAGE`, L74-100) and
    // the shared core's `resolveContact` (webhook/core.ts L420-440 — resolution
    // ORDER only). WAHA stays fully isolated (see the file header): the shape is
    // copied here on purpose so a change to the shared pipeline can never
    // silently alter WAHA's behavior. Why: an unknown number used to spawn a
    // pending_review customer ghost; now it becomes a real Lead (owned by the
    // rotation pick on live inbound), which stops the Funnel from manufacturing
    // fake customers. The @lid-unresolved (forged-phone) branches keep the
    // minimal customer anchor — those digits are NOT a validated phone and must
    // never seed a lead.
    async function getFirstPipelineStage(): Promise<Record<string, unknown>> {
      const { data } = await admin
        .from("stores")
        .select("settings")
        .eq("id", accountRow.store_id as string)
        .maybeSingle();
      const stages = (data?.settings as { pipelineStages?: Array<Record<string, unknown>> } | null)
        ?.pipelineStages;
      if (!stages || stages.length === 0) return DEFAULT_FIRST_STAGE;
      return [...stages].sort((a, b) => (a.order as number) - (b.order as number))[0]!;
    }

    // Echo-continuity window setting (decision 2026-07-23, doc §7 item 3) —
    // per store, stores.settings->echoContinuity.windowHours (default 24,
    // 0 = disabled). A transient read failure fails CLOSED (503 → WAHA
    // retries) instead of silently degrading to always-create.
    async function getEchoContinuityWindowHours(): Promise<number> {
      const { data, error } = await admin
        .from("stores")
        .select("settings")
        .eq("id", accountRow.store_id as string)
        .maybeSingle();
      if (error) throw new TransientDbError(`echo continuity settings read: ${error.message}`);
      return resolveEchoContinuityWindowHours(data?.settings);
    }

    // Rotation owner for a live inbound lead. The RPC is frozen (never returns
    // null — it falls back to a fixed seller when no queue/eligible member
    // exists). leads.seller_id is nullable since migration 20260718150000
    // (ownerless leads on the echo/archive/import paths); a live inbound
    // always resolves an owner here, so it just never needs the null case.
    async function assignRotationSeller(): Promise<string> {
      const { data, error } = await admin.rpc("assign_next_from_rotation", {
        p_store_id: accountRow.store_id as string,
      });
      if (error) throw new Error(`assign_next_from_rotation: ${error.message}`);
      return data as string;
    }

    // Suffix pre-filter on the generated digits column + tolerant BR match —
    // same shape as findCustomerByPhone above (stored numbers vary: missing DDI
    // 55, 9th-digit divergence). leads.phone_digits is a generated digits-only
    // column (migration 20260716210000). Returns the lead's owner + loss state
    // so the caller can decide reuse / reopen / owner-assignment.
    async function findLeadByPhone(phoneDigits: string): Promise<
      | {
          id: string;
          sellerId: string | null;
          lossReason: string | null;
          convertedToCustomerId: string | null;
        }
      | undefined
    > {
      const { data: candidates, error: candidatesErr } = await admin
        .from("leads")
        .select("id, seller_id, loss_reason, phone_digits, converted_to_customer_id")
        .eq("store_id", accountRow.store_id as string)
        .like("phone_digits", `%${phoneDigits.slice(-8)}`);
      // Fail CLOSED — same rationale as findCustomerByPhone above.
      if (candidatesErr) throw new TransientDbError(`findLeadByPhone: ${candidatesErr.message}`);
      const match = (candidates ?? []).find((l) =>
        phoneDigitsMatchBr(String(l.phone_digits ?? "").replace(/\D/g, ""), phoneDigits),
      );
      if (!match) return undefined;
      return {
        id: match.id as string,
        sellerId: (match.seller_id as string | null) ?? null,
        lossReason: (match.loss_reason as string | null) ?? null,
        convertedToCustomerId: (match.converted_to_customer_id as string | null) ?? null,
      };
    }

    // Reopen a previously-lost lead: clear the loss and restore the first stage
    // (mirror of reopenLostLead v0.150). Rotation (re)assignment is the caller's
    // job — it happens only when the PERSON answers (live inbound).
    async function reopenLead(leadId: string): Promise<void> {
      const firstStage = await getFirstPipelineStage();
      const { error } = await admin
        .from("leads")
        .update({ loss_reason: null, loss_notes: null, stage: firstStage })
        .eq("id", leadId);
      if (error) throw new Error(`reopenLead: ${error.message}`);
    }

    // Low-level lead insert (mirror of createLead's shape, v0.150). origin is
    // always 'whatsapp' here — the acervo migration script uses 'import'
    // instead. sellerId is null on the echo path (owner-less until the person
    // answers): this REQUIRES leads.seller_id to be nullable — see the report.
    async function insertLead(input: {
      phone: string;
      name: string;
      sellerId: string | null;
      temperature: "morno" | "frio";
    }): Promise<string> {
      const firstStage = await getFirstPipelineStage();
      const { data, error } = await admin
        .from("leads")
        .insert({
          // leads.id is `text primary key` with no DB default — the caller
          // must mint it, mirroring the app-level provider
          // (src/providers/data/impl/supabase/leads.ts).
          id: crypto.randomUUID(),
          store_id: accountRow.store_id,
          seller_id: input.sellerId,
          name: input.name,
          phone: input.phone,
          stage: firstStage,
          temperature: input.temperature,
          origin: "whatsapp",
          conversations: [],
          tags: [],
        })
        .select("id")
        .single();
      if (error) throw new Error(`insertLead: ${error.message}`);
      return data.id as string;
    }

    // LIVE INBOUND resolution: reuse / reopen an existing lead — assigning the
    // rotation owner the moment the person writes to us — or create a fresh warm
    // lead. Resolution order mirrors resolveContact: customer (handled by the
    // caller) → existing lead (reopened if lost) → brand-new lead.
    async function resolveLeadForInbound(
      phoneDigits: string,
      fromPhone: string,
      contactName: string | undefined,
    ): Promise<{ kind: "customer" | "lead"; id: string }> {
      const existing = await findLeadByPhone(phoneDigits);
      if (existing?.convertedToCustomerId) {
        // Converted lead (PR #357 item 4): its conversations were re-anchored
        // to the customer by leads_reanchor_converted — resolving as a lead
        // again would mint a fresh empty lead-anchored conversation and
        // recreate the split (reachable when the linked customer's phone
        // differs from the lead's). Follow the conversion pointer instead.
        console.log(
          JSON.stringify({
            level: "info",
            msg: "waha webhook: converted lead resolved as customer",
            leadId: existing.id,
            customerId: existing.convertedToCustomerId,
            path: "inbound",
          }),
        );
        return { kind: "customer", id: existing.convertedToCustomerId };
      }
      if (existing) {
        if (existing.lossReason !== null) {
          // Lost lead came back to life — clear the loss/restore the stage and
          // (re)assign an owner via rotation now that the person answered.
          await reopenLead(existing.id);
          const sellerId = await assignRotationSeller();
          await admin.from("leads").update({ seller_id: sellerId }).eq("id", existing.id);
          console.log(
            JSON.stringify({
              level: "info",
              msg: "waha webhook: lead reopened",
              leadId: existing.id,
              path: "inbound",
            }),
          );
        } else if (existing.sellerId === null) {
          // Acervo/import lead with no owner yet — assign one now it's live.
          const sellerId = await assignRotationSeller();
          await admin.from("leads").update({ seller_id: sellerId }).eq("id", existing.id);
          console.log(
            JSON.stringify({
              level: "info",
              msg: "waha webhook: lead matched",
              leadId: existing.id,
              path: "inbound",
            }),
          );
        } else {
          console.log(
            JSON.stringify({
              level: "info",
              msg: "waha webhook: lead matched",
              leadId: existing.id,
              path: "inbound",
            }),
          );
        }
        return { kind: "lead", id: existing.id };
      }
      const sellerId = await assignRotationSeller();
      const leadId = await insertLead({
        phone: fromPhone,
        name: contactName ?? fromPhone,
        sellerId,
        temperature: "morno",
      });
      console.log(
        JSON.stringify({
          level: "info",
          msg: "waha webhook: lead created",
          leadId,
          path: "inbound",
        }),
      );
      return { kind: "lead", id: leadId };
    }

    // OUTBOUND ECHO resolution (we messaged them from the phone): reuse an
    // existing lead AS-IS — never reopen a lost one, never assign rotation
    // (that happens only when the person answers, on the inbound path). If none
    // exists, create a COLD, OWNER-LESS lead (no rotation): the team reached out
    // but nobody has claimed the thread yet.
    async function resolveLeadForEcho(
      phoneDigits: string,
      toPhone: string,
      contactName: string | undefined,
    ): Promise<{ kind: "customer" | "lead"; id: string }> {
      const existing = await findLeadByPhone(phoneDigits);
      if (existing?.convertedToCustomerId) {
        // Converted lead — same conversion-pointer rule as the inbound
        // resolver above.
        console.log(
          JSON.stringify({
            level: "info",
            msg: "waha webhook: converted lead resolved as customer",
            leadId: existing.id,
            customerId: existing.convertedToCustomerId,
            path: "echo",
          }),
        );
        return { kind: "customer", id: existing.convertedToCustomerId };
      }
      if (existing) {
        console.log(
          JSON.stringify({
            level: "info",
            msg: "waha webhook: lead matched",
            leadId: existing.id,
            path: "echo",
          }),
        );
        return { kind: "lead", id: existing.id };
      }
      const leadId = await insertLead({
        phone: toPhone,
        name: contactName ?? toPhone,
        sellerId: null,
        temperature: "frio",
      });
      console.log(
        JSON.stringify({
          level: "info",
          msg: "waha webhook: lead created",
          leadId,
          path: "echo",
        }),
      );
      return { kind: "lead", id: leadId };
    }

    // Shared media download+upload — best-effort, never fails the caller (only
    // updates the message's own media_download_status). Used by both the
    // inbound-message and outbound-echo paths below.
    async function attachMedia(
      mediaId: string,
      conversationId: string,
      messageId: string,
      isInboundAudio: boolean,
    ): Promise<void> {
      try {
        const apiKey = await getApiKey();
        if (!apiKey) throw new Error("missing server api key");
        const media = await downloadWahaMedia(apiKey, globalThis.fetch, mediaId);
        const ext = extForMimetype(media.mimeType);
        const path = `conversations/${conversationId}/${messageId}/media.${ext}`;
        const { error: uploadError } = await admin.storage
          .from("whatsapp-media")
          .upload(path, media.data, { contentType: media.mimeType, upsert: true });
        if (uploadError) throw new Error(uploadError.message);
        await admin
          .from("messages")
          .update({ media_url: path, media_download_status: "ok" })
          .eq("id", messageId);
        if (isInboundAudio) {
          await admin
            .from("messages")
            .update({ transcription_status: "pending" })
            .eq("id", messageId);
          runInBackground(transcribeMessageAudio(admin, messageId));
        }
      } catch (err) {
        console.warn(
          JSON.stringify({
            level: "warn",
            msg: "waha webhook: media download failed",
            error: err instanceof Error ? err.message : String(err),
          }),
        );
        await admin
          .from("messages")
          .update({ media_url: null, media_download_status: "failed" })
          .eq("id", messageId);
      }
    }

    // Shared webhook-completion marker (diagnostics only — queried by the ops
    // path when tracing a "message never arrived" report). Used by both the
    // inbound-message and outbound-echo paths below.
    async function logWebhookSuccess(): Promise<void> {
      await admin.from("integration_logs").insert({
        integration_name: "whatsapp_waha",
        direction: "inbound",
        endpoint: "/waha-webhook",
        http_status: 200,
        trace_id: null,
        request_payload: { event: envelope.event, session: envelope.session },
      });
    }

    // Delivery/read tracking (message.ack). Mirrors the anti-regression
    // pattern the reference `whatsapp-webhook` uses (applyStatusToMessage,
    // not imported here — WAHA stays fully isolated), reusing the same
    // shared, engine-agnostic `statusAdvances` ranking so a transient
    // `failed` ack never clobbers an already-delivered/read message.
    // No-ops when the message isn't found (e.g. an ack for a message this
    // store never sent).
    async function applyWahaAckToMessage(
      providerMessageId: string,
      status: DeliveryStatus,
      timestamp: string,
    ): Promise<void> {
      const { data } = await admin
        .from("messages")
        .select("id, status, webhook_event_ids")
        .eq("provider_message_id", providerMessageId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!data) return;
      const current = (data.status as DeliveryStatus | undefined) ?? "queued";
      if (!statusAdvances(current, status)) return;
      const eventIds = [...((data.webhook_event_ids as string[] | undefined) ?? []), eventKey];
      const patch: Record<string, unknown> = { status, webhook_event_ids: eventIds };
      if (status === "delivered") patch.delivered_at = timestamp;
      if (status === "read") patch.read_at = timestamp;
      await admin
        .from("messages")
        .update(patch)
        .eq("id", data.id as string);
    }

    // Needed by both the inbound @lid resolution below and the outbound-echo
    // toLid resolution — computed once, before either branch.
    const sessionName = String(
      (accountRow.provider_config as Record<string, unknown> | null)?.sessionName ?? "",
    );
    const wahaBaseUrl = String(server.base_url ?? "").replace(/\/+$/, "");

    if (envelope.event === "session.status") {
      const payload = envelope.payload as { status?: string } | null;
      const accountStatus = wahaStateToAccountStatus(String(payload?.status ?? ""));
      const { error: statusErr } = await admin
        .from("whatsapp_accounts")
        .update({ status: accountStatus })
        .eq("id", accountRow.id);
      if (!statusErr) await markProcessed();
      return respond(json({ ok: true }, 200), {
        outcome: "processed",
        eventType: "session.status",
        requestPayload: envelope,
      });
    }

    if (envelope.event === "message.ack") {
      const parsedAck = parseWahaAckPayload(envelope.payload);
      if (!parsedAck) {
        await markProcessed();
        return respond(json({ ok: true, ignored: "unparseable-ack" }, 200), {
          outcome: "ignored",
          eventType: "message.ack",
          requestPayload: envelope,
        });
      }
      // WAHA's message.ack payload carries no timestamp of its own (unlike
      // message/message.any) — the server-received time is the best signal.
      await applyWahaAckToMessage(
        parsedAck.providerMessageId,
        parsedAck.status,
        new Date().toISOString(),
      );
      await markProcessed();
      return respond(json({ ok: true }, 200), {
        outcome: "processed",
        eventType: "message.ack",
        requestPayload: envelope,
      });
    }

    if (envelope.event === "message.reaction") {
      let reaction;
      try {
        reaction = parseWahaReactionEvent(envelope.payload);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        await markProcessed();
        return respond(json({ ok: true, ignored: "unparseable-reaction" }, 200), {
          outcome: "ignored",
          errorMessage: detail,
          requestPayload: envelope,
        });
      }

      // The reacted message must already exist here. A reaction to a message
      // older than the import is expected and benign — record and move on.
      // A SELECT *error* (e.g. a transient timeout) is NOT the same thing as
      // "target missing": treating it as missing would mark the event
      // processed and lose the reaction forever, since WAHA's redelivery
      // would then hit the processed_events guard and be discarded as a
      // duplicate before the write is ever retried.
      const { data: target, error: targetErr } = await admin
        .from("messages")
        .select("id, conversation_id, reactions, webhook_event_ids")
        .eq("provider_message_id", reaction.targetProviderMessageId)
        .maybeSingle();

      if (targetErr) {
        console.warn(
          JSON.stringify({
            level: "warn",
            msg: "waha webhook: reaction target lookup failed",
            error: targetErr.message,
          }),
        );
        return respond(json({ error: "reaction target lookup failed" }, 503), {
          outcome: "error",
          errorMessage: targetErr.message,
          requestPayload: envelope,
        });
      }

      if (!target) {
        await markProcessed();
        return respond(json({ ok: true, ignored: "reaction-target-missing" }, 200), {
          outcome: "ignored",
          errorMessage: `alvo ${reaction.targetProviderMessageId} não encontrado`,
          requestPayload: envelope,
        });
      }

      // Optimistic patch of the reacted message: the UPDATE is conditioned on
      // the exact `reactions` snapshot this call read, so a concurrent writer
      // (the other side reacting on the same message in the same second)
      // makes the write match 0 rows instead of silently overwriting their
      // slot. Also appends `eventKey` to `webhook_event_ids`, mirroring
      // applyWahaAckToMessage above, so the forensic trail (message →
      // webhook_event_ids → processed_events/webhook_deliveries) can find the
      // delivery that changed the slot.
      type TargetRow = {
        id: string;
        conversation_id: string;
        reactions: unknown;
        webhook_event_ids: unknown;
      };
      async function patchReactionTarget(
        row: TargetRow,
      ): Promise<{ applied: boolean; errorMessage?: string }> {
        const snapshot = (row.reactions as Parameters<typeof applyReaction>[0]) ?? null;
        const next = applyReaction(snapshot, reaction);
        const eventIds = [...((row.webhook_event_ids as string[] | undefined) ?? []), eventKey];
        let query = admin
          .from("messages")
          .update({ reactions: next, webhook_event_ids: eventIds })
          .eq("id", row.id);
        // Optimistic guard: only write over the exact snapshot we computed from
        // — a concurrent writer (the other side reacting in the same second)
        // makes this match 0 rows instead of silently losing their slot.
        query =
          snapshot === null
            ? query.is("reactions", null)
            : query.eq("reactions", JSON.stringify(snapshot));
        const { data, error } = await query.select("id");
        if (error) return { applied: false, errorMessage: error.message };
        return { applied: (data?.length ?? 0) > 0 };
      }

      let patchResult = await patchReactionTarget(target as TargetRow);
      if (!patchResult.applied && !patchResult.errorMessage) {
        // Lost the optimistic race against a concurrent reaction on the same
        // message — refetch the (now different) snapshot and retry exactly
        // once. The refetch already sees the concurrent writer's slot, and
        // applyReaction merges the two sides cleanly.
        const { data: refetched, error: refetchErr } = await admin
          .from("messages")
          .select("id, conversation_id, reactions, webhook_event_ids")
          .eq("id", target.id)
          .maybeSingle();
        if (refetchErr || !refetched) {
          console.warn(
            JSON.stringify({
              level: "warn",
              msg: "waha webhook: reaction retry refetch failed",
              error: refetchErr?.message ?? "target row disappeared",
            }),
          );
          return respond(json({ error: "reaction target lookup failed" }, 503), {
            outcome: "error",
            errorMessage: refetchErr?.message ?? "target row disappeared",
            requestPayload: envelope,
          });
        }
        patchResult = await patchReactionTarget(refetched as TargetRow);
      }

      if (!patchResult.applied) {
        // Either the UPDATE itself errored, or the retry above also lost its
        // optimistic race. Do NOT mark processed and do NOT touch the
        // conversation: WAHA only redelivers on a non-2xx response, so the
        // 503 (not a 200) is what actually makes a retry of this event
        // happen — a retry then reprocesses cleanly, since the refetch will
        // see whatever won the race.
        console.warn(
          JSON.stringify({
            level: "warn",
            msg: "waha webhook: reaction update failed",
            error: patchResult.errorMessage ?? "optimistic write conflict after retry",
          }),
        );
        return respond(json({ error: "reaction update failed" }, 503), {
          outcome: "error",
          errorMessage: patchResult.errorMessage ?? "optimistic write conflict after retry",
          requestPayload: envelope,
        });
      }

      // A customer reaction IS an interaction: it bumps the conversation and
      // marks it unread, so a 👍 stops reading as "no answer". The shop's own
      // reaction is recorded but must not touch the queue. The bump itself is
      // one atomic RPC (waha_reaction_touch — see its migration) instead of a
      // SELECT-then-UPDATE: the old read-modify-write silently overwrote a
      // concurrent markRead and could regress last_message_at on a
      // redelivered event. The RPC also skips closed conversations
      // (resolvida/arquivada) — owner decision 2026-07-24: a reaction on a
      // closed conversation is almost always a thank-you, not a new demand,
      // so it must not reopen the queue.
      //
      // `awaiting_reply_since` is deliberately NOT touched here, nor by the
      // RPC. That column means "since when the customer has been waiting on
      // US", and it is owned by the trigger on `messages`
      // (sync_conversation_awaiting_reply), which clears it only on a genuine
      // outbound. A reaction is not the shop answering — the customer is
      // still waiting — so clearing it would silently disarm the
      // idle-conversation alerts for an unanswered question. Leave the column
      // entirely to the trigger.
      if (!reaction.fromMe && reaction.emoji) {
        const { error: touchErr } = await admin.rpc("waha_reaction_touch", {
          p_conversation_id: target.conversation_id as string,
          p_ts: reaction.timestamp,
        });
        if (touchErr) {
          // Best-effort: the reaction itself already landed on the message.
          // Losing one unread bump in a rare transient failure beats failing
          // the whole event (a 503 here would re-run the message patch and
          // double-append the event key on redelivery).
          console.warn(
            JSON.stringify({
              level: "warn",
              msg: "waha webhook: reaction touch failed",
              error: touchErr.message,
            }),
          );
        }
      }

      await markProcessed();
      return respond(json({ ok: true, reaction: "applied" }, 200), {
        outcome: "processed",
        requestPayload: envelope,
      });
    }

    if (envelope.event !== "message" && envelope.event !== "message.any") {
      // No persistent work happens for unknown event types — safe to mark so a
      // WAHA retry of the same envelope doesn't repeat the (harmless) parse.
      await markProcessed();
      return respond(json({ ok: true, ignored: envelope.event }, 200), {
        outcome: "ignored",
        requestPayload: envelope,
      });
    }

    let parsed;
    try {
      parsed = parseWahaMessageEvent(envelope.payload, accountRow.id as string);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.warn(
        JSON.stringify({ level: "warn", msg: "waha webhook: unparseable message", error: detail }),
      );
      await markProcessed();
      return respond(json({ ok: true, ignored: "unparseable" }, 200), {
        outcome: "ignored",
        errorMessage: detail,
        requestPayload: envelope,
      });
    }

    // "message.any" is subscribed ONLY to reach fromMe:true echoes — WAHA
    // (GOWS engine) never fires plain "message" for those. Genuine inbound
    // already arrives via "message"; skip it here so the same envelope isn't
    // processed twice if WAHA ever double-delivers.
    if (envelope.event === "message.any" && parsed.type !== "outbound-echo") {
      await markProcessed();
      return respond(json({ ok: true, ignored: "message.any-inbound-dup" }, 200), {
        outcome: "ignored",
        requestPayload: envelope,
      });
    }

    if (parsed.type === "outbound-echo") {
      // Mirror what the team sends FROM THE PHONE (outside the platform) —
      // otherwise a reply given directly on WhatsApp leaves an invisible gap
      // in the Atendimento thread. App-sent messages (via waha-send) echo back
      // too, so dedup by provider_message_id BEFORE any write: waha-send
      // stamps the same id WAHA later reports here as payload.id.
      const { data: existingOutbound, error: echoDedupErr } = await admin
        .from("messages")
        .select("id")
        .eq("provider_message_id", parsed.providerMessageId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (echoDedupErr) return transientDbFailure("echo dedup lookup", echoDedupErr);
      if (existingOutbound) {
        // Free signal: WAHA embeds the CURRENT ack level in every
        // message.any echo, not just in dedicated message.ack events —
        // apply it before bailing out on the duplicate.
        const echoAck = (envelope.payload as { ack?: number } | null)?.ack;
        if (typeof echoAck === "number") {
          await applyWahaAckToMessage(
            parsed.providerMessageId,
            mapWahaAckToStatus(echoAck),
            new Date().toISOString(),
          );
        }
        await markProcessed();
        return respond(json({ ok: true, duplicate: "app-send echo" }, 200), {
          outcome: "duplicate",
          requestPayload: envelope,
        });
      }

      // Same @lid caveat as the inbound path, mirrored on the destination: the
      // team may reply to a contact whose privacy setting hides their number,
      // so `to` also arrives as `<digits>@lid` — resolve it the same way
      // before it can be mistaken for a phone.
      let toPhone = parsed.toPhone;
      let toLidUnresolved = false;
      if (!toPhone && parsed.toLid) {
        try {
          const apiKey = await getApiKey();
          if (!apiKey) throw new Error("missing server api key");
          const { phone } = await resolveWahaLid(apiKey, globalThis.fetch, {
            baseUrl: wahaBaseUrl,
            sessionName,
            lid: parsed.toLid,
            timeoutMs: 5_000,
          });
          if (phone) toPhone = phone;
        } catch (err) {
          console.warn(
            JSON.stringify({
              level: "warn",
              msg: "waha webhook: echo lid resolution failed",
              lid: parsed.toLid,
              error: err instanceof Error ? err.message : String(err),
            }),
          );
        }
        if (!toPhone) {
          const lidDigits = parsed.toLid.split("@")[0]?.replace(/\D/g, "") ?? "";
          if (!lidDigits) {
            await markProcessed();
            return respond(json({ ok: true, ignored: "no-phone" }, 200), {
              outcome: "ignored",
              requestPayload: envelope,
            });
          }
          toPhone = `+${lidDigits}`;
          toLidUnresolved = true;
        }
      }
      if (!toPhone) {
        await markProcessed();
        return respond(json({ ok: true, ignored: "no-phone" }, 200), {
          outcome: "ignored",
          requestPayload: envelope,
        });
      }
      const echoPhoneDigits = toPhone.replace(/\D/g, "");

      // Resolution (Funnel Frente 3): a real customer keeps today's anchor; a
      // forged @lid keeps the minimal pending_review customer (byte-for-byte,
      // below); any other unknown number becomes a Lead instead of a customer
      // ghost — echo variant (no rotation).
      let echoAnchorKind: "customer" | "lead" = "customer";
      let echoAnchorId: string;
      const echoCustomerId = await findCustomerByPhone(echoPhoneDigits, {
        adoptCanonical: !toLidUnresolved,
      });
      if (echoCustomerId) {
        echoAnchorId = echoCustomerId;
      } else if (toLidUnresolved) {
        // Forged @lid digits never become a lead: keep the minimal customer
        // anchor. No seller_id (wallet owner), tags:["pending_review"] — a human
        // converts it manually. An unresolved lid must NEVER surface its digits
        // as a name (spec §5 risk 3) — same neutral pt-BR label as inbound.
        const { data: createdEchoCustomer, error: echoCustomerErr } = await admin
          .from("customers")
          .insert({
            store_id: accountRow.store_id,
            type: "B2C", // customers_type_check requires UPPERCASE 'B2C'
            phone: toPhone,
            full_name: toLidUnresolved ? "Contato do WhatsApp (número oculto)" : toPhone,
            status: "ativo",
            tags: toLidUnresolved ? ["pending_review", "lid_unresolved"] : ["pending_review"],
          })
          .select("id")
          .single();
        if (echoCustomerErr) {
          return transientDbFailure("echo customer insert", echoCustomerErr);
        }
        echoAnchorId = createdEchoCustomer.id as string;
      } else {
        // Unknown number → Lead (echo variant): reuse an existing lead as-is,
        // else create a COLD owner-less lead. Seed a display name best-effort
        // from the WhatsApp contact — one extra GET only on this miss path.
        let contactName: string | undefined;
        try {
          const apiKey = await getApiKey();
          if (apiKey) {
            contactName = await getWahaContactName(apiKey, globalThis.fetch, {
              baseUrl: wahaBaseUrl,
              sessionName,
              contactId: parsed.toLid ?? `${echoPhoneDigits}@c.us`,
              timeoutMs: 5_000,
            });
          }
        } catch {
          /* name is decorative — never blocks the lead */
        }
        const echoResolved = await resolveLeadForEcho(echoPhoneDigits, toPhone, contactName);
        echoAnchorId = echoResolved.id;
        echoAnchorKind = echoResolved.kind;
      }

      // OPEN-ONLY lookup (excludes resolvida/arquivada): an echo is
      // business-sent and must NEVER reopen a closed conversation — it spawns
      // a fresh one instead, same rule as the reference `whatsapp-webhook`
      // pipeline (spec 2026-07-03 §1.5).
      const echoAnchorColumn = echoAnchorKind === "customer" ? "customer_id" : "lead_id";
      const echoAnchorValue = echoAnchorKind === "lead" ? String(echoAnchorId) : echoAnchorId;
      const findOpenEchoConversation = () =>
        admin
          .from("conversations")
          .select("id")
          .eq(echoAnchorColumn, echoAnchorValue)
          .eq("whatsapp_account_id", accountRow.id as string)
          .not("status", "in", `(${CLOSED_CONVERSATION_STATUSES.join(",")})`)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
      const { data: openEchoConversation, error: echoLookupErr } = await findOpenEchoConversation();
      if (echoLookupErr) return transientDbFailure("echo conversation lookup", echoLookupErr);

      let echoConversationId: string | undefined = openEchoConversation
        ? (openEchoConversation.id as string)
        : undefined;

      if (echoConversationId === undefined) {
        // Continuity window (decision 2026-07-23, doc §7 item 3): append to
        // the contact's most recent `resolvida` conversation on this account
        // when it was closed less than N hours ago — WITHOUT reopening it
        // (the customer's next inbound reopens that same thread through the
        // normal inbound rule; `arquivada` is a deliberate discard and never
        // participates). Governed per store by
        // settings->echoContinuity.windowHours (default 24, 0 = off).
        const windowHours = await getEchoContinuityWindowHours();
        const continuityCutoff = echoContinuityCutoffIso(Date.now(), windowHours);
        if (continuityCutoff) {
          const { data: recentlyClosed, error: continuityErr } = await admin
            .from("conversations")
            .select("id")
            .eq(echoAnchorColumn, echoAnchorValue)
            .eq("whatsapp_account_id", accountRow.id as string)
            .eq("status", "resolvida")
            .gte("closed_at", continuityCutoff)
            .order("closed_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (continuityErr) return transientDbFailure("echo continuity lookup", continuityErr);
          if (recentlyClosed) echoConversationId = recentlyClosed.id as string;
        }
      }

      if (echoConversationId === undefined) {
        const { data: createdEchoConversation, error: echoConvErr } = await admin
          .from("conversations")
          .insert({
            store_id: accountRow.store_id,
            // Exactly one of customer_id / lead_id is set (app-level invariant).
            customer_id: echoAnchorKind === "customer" ? echoAnchorId : null,
            lead_id: echoAnchorKind === "lead" ? String(echoAnchorId) : null,
            whatsapp_account_id: accountRow.id,
            // UNASSIGNED (pool): the webhook cannot know which staff member
            // sent from the phone, so it never pins the chat — it lands
            // queued ('aguardando') for someone to claim in the app.
            assigned_seller_id: null,
            channel: "whatsapp",
            status: "aguardando",
            last_message_at: parsed.timestamp,
            unread_count: 0,
          })
          .select("id")
          .single();
        if (echoConvErr) {
          if (echoConvErr.code === "23505") {
            // Lost a concurrent-create race: the partial unique index
            // (conversations_one_open_per_*_account) vetoed this INSERT, so
            // the winner's row IS the open conversation now — reuse it.
            const { data: raceWinner, error: raceErr } = await findOpenEchoConversation();
            if (raceErr || !raceWinner) {
              return transientDbFailure(
                "echo race recovery",
                raceErr ?? { message: "unique violation but no open conversation found" },
              );
            }
            echoConversationId = raceWinner.id as string;
          } else {
            return transientDbFailure("echo conversation insert", echoConvErr);
          }
        } else {
          echoConversationId = createdEchoConversation.id as string;
        }
      }
      if (echoConversationId === undefined) {
        // Unreachable — every branch above either returned or assigned.
        return transientDbFailure("echo conversation resolution", {
          message: "no conversation id resolved",
        });
      }

      // Quote resolution runs BEFORE the insert so the row lands complete — a
      // follow-up UPDATE would race the Realtime event and make the bubble
      // flicker from un-quoted to quoted.
      const echoReplyTo = await resolveReplyRef(admin, echoConversationId, parsed.replyTo);

      const echoMessageId = crypto.randomUUID();
      const { error: echoMessageErr } = await admin.from("messages").insert({
        id: echoMessageId,
        conversation_id: echoConversationId,
        direction: "out",
        author_type: "seller",
        author_id: null, // unknown — no session ties a phone-sent message to a specific staff member
        provider: "waha",
        text: parsed.text ?? parsed.mediaCaption ?? "",
        media_type: ["text", "unknown"].includes(parsed.contentType) ? null : parsed.contentType,
        media_filename: parsed.mediaFilename ?? null,
        // See the inbound insert — same upstream-download-failure marker.
        media_download_status:
          ["image", "audio", "video", "document"].includes(parsed.contentType) && !parsed.mediaId
            ? "failed"
            : null,
        status: "sent",
        sent_at: parsed.timestamp,
        provider_message_id: parsed.providerMessageId,
        webhook_event_ids: [eventKey],
        reply_to: echoReplyTo,
      });
      if (echoMessageErr) {
        // 503 (not the old silent 200): the conversation may already exist but
        // the message didn't land — a WAHA retry re-runs this event cleanly
        // (markProcessed hasn't happened yet; the echo dedup + open lookup
        // above make the retry idempotent).
        return transientDbFailure("echo message insert", echoMessageErr);
      }
      // Mark processed only now that the message has actually landed — a retry
      // of this event while echoMessageErr was set will reprocess cleanly.
      await markProcessed();

      // Advance-only bump — a late-arriving echo must never walk
      // last_message_at backwards.
      await admin
        .from("conversations")
        .update({ last_message_at: parsed.timestamp })
        .eq("id", echoConversationId)
        .lt("last_message_at", parsed.timestamp);

      if (parsed.mediaId) {
        await attachMedia(parsed.mediaId, echoConversationId, echoMessageId, false);
      }
      await logWebhookSuccess();
      return respond(json({ ok: true }, 200), {
        outcome: "processed",
        eventType: "message.any",
        requestPayload: envelope,
      });
    }

    // ===== @lid resolution (privacy id → real phone) ===========================
    // A sender behind WhatsApp's privacy setting arrives as `<digits>@lid`, not
    // `<phone>@c.us`. GOWS keeps the lid↔phone map — resolve BEFORE customer
    // matching so dedup and display use the real number. Fail-safe: a resolution
    // error degrades to the unresolved fallback below, never dropping the
    // message. Short timeout (5s): this runs before markProcessed, and a slow
    // lookup here must not outlast WAHA's own webhook-delivery timeout/retry.
    let fromPhone = parsed.fromPhone;
    let lidUnresolved = false;
    if (!fromPhone && parsed.fromLid) {
      try {
        const apiKey = await getApiKey();
        if (!apiKey) throw new Error("missing server api key");
        const { phone } = await resolveWahaLid(apiKey, globalThis.fetch, {
          baseUrl: wahaBaseUrl,
          sessionName,
          lid: parsed.fromLid,
          timeoutMs: 5_000,
        });
        if (phone) fromPhone = phone;
      } catch (err) {
        console.warn(
          JSON.stringify({
            level: "warn",
            msg: "waha webhook: lid resolution failed",
            lid: parsed.fromLid,
            error: err instanceof Error ? err.message : String(err),
          }),
        );
      }
      if (!fromPhone) {
        // Unresolved lid: keep a stable placeholder derived from the lid digits
        // so the conversation still threads (same digits ⇒ same customer), but
        // tag the customer for triage — the digits are NEVER a validated phone
        // and are NEVER shown as the display name (see the insert below).
        const lidDigits = parsed.fromLid.split("@")[0]?.replace(/\D/g, "") ?? "";
        if (!lidDigits) {
          await markProcessed();
          return respond(json({ ok: true, ignored: "no-phone" }, 200), {
            outcome: "ignored",
            requestPayload: envelope,
          });
        }
        fromPhone = `+${lidDigits}`;
        lidUnresolved = true;
      }
    }
    if (!fromPhone) {
      await markProcessed();
      return respond(json({ ok: true, ignored: "no-phone" }, 200), {
        outcome: "ignored",
        requestPayload: envelope,
      });
    }
    const phoneDigits = fromPhone.replace(/\D/g, "");

    // ===== Customer resolution (Correction 1) ==================================
    // Adopt-canonical only when the wire number is a real pn — an unresolved
    // lid placeholder must never overwrite a stored phone.
    // Resolution (Funnel Frente 3): a real customer keeps today's pool-anchor
    // behavior; a forged @lid keeps the minimal pending_review customer
    // (byte-for-byte, below); any other unknown number becomes a Lead owned by
    // the rotation pick — no more pending_review customer ghosts. Exactly one of
    // anchorKind/anchorId identifies the contact for the conversation + message.
    const foundCustomerId = await findCustomerByPhone(phoneDigits, {
      adoptCanonical: !lidUnresolved,
    });
    let anchorKind: "customer" | "lead" = "customer";
    let anchorId: string;
    if (foundCustomerId) {
      anchorId = foundCustomerId;
    } else {
      // Seed the display name from the WhatsApp contact (pushname) — best-effort,
      // one extra GET only on the miss path. Shared by the @lid customer anchor
      // and the new-lead path below. The lid id is the known-good identity when
      // present (the contacts endpoint accepts @lid directly).
      let contactName: string | undefined;
      try {
        const apiKey = await getApiKey();
        if (apiKey) {
          contactName = await getWahaContactName(apiKey, globalThis.fetch, {
            baseUrl: wahaBaseUrl,
            sessionName,
            contactId: parsed.fromLid ?? `${phoneDigits}@c.us`,
            timeoutMs: 5_000,
          });
        }
      } catch {
        /* name is decorative — never blocks the insert */
      }

      if (lidUnresolved) {
        // Forged @lid digits never become a lead — keep the minimal customer
        // anchor. NO seller_id (wallet owner): a pool conversation only, until a
        // human manually converts it. tags:["pending_review"] is what the
        // Customers list UI filters out by default.
        const { data: createdCustomer, error: customerErr } = await admin
          .from("customers")
          .insert({
            store_id: accountRow.store_id,
            type: "B2C", // customers_type_check requires UPPERCASE 'B2C'
            phone: fromPhone,
            // Display label decision (spec §5 risk 3): an unresolved lid must NEVER
            // surface its digits as a name — fall back to a pt-BR label instead.
            full_name:
              contactName ?? (lidUnresolved ? "Contato do WhatsApp (número oculto)" : fromPhone),
            whatsapp_name: contactName ?? null,
            status: "ativo",
            tags: lidUnresolved ? ["pending_review", "lid_unresolved"] : ["pending_review"],
          })
          .select("id")
          .single();
        if (customerErr) {
          return transientDbFailure("inbound customer insert", customerErr);
        }
        anchorId = createdCustomer.id as string;
      } else {
        // Unknown number → Lead (live inbound): resolve/reopen/create and assign
        // the rotation owner at this moment (the person just wrote to us).
        const inboundResolved = await resolveLeadForInbound(phoneDigits, fromPhone, contactName);
        anchorId = inboundResolved.id;
        anchorKind = inboundResolved.kind;
      }
    }

    // ===== Conversation resolution: reuse-or-reopen-or-create (Correction 2) ===
    // Anchored by customer_id OR lead_id (exactly one), mirroring THIS file's
    // local reuse-or-reopen semantics (not whatsapp-webhook's) so the reopen
    // behavior below is preserved.
    //
    // OPEN-FIRST (2026-07-23): prefer the open conversation over the one with
    // the newest message. Under the one-open-per-contact-per-account unique
    // index, reopening a closed row while another is open would violate the
    // index — and routing new traffic into the open thread is the correct
    // semantics whenever both exist (e.g. leftovers of a pre-index race).
    const anchorColumn = anchorKind === "customer" ? "customer_id" : "lead_id";
    const anchorValue = anchorKind === "lead" ? String(anchorId) : anchorId;
    const findConversationForInbound = (openOnly: boolean) => {
      let query = admin
        .from("conversations")
        .select("id, status, unread_count")
        .eq(anchorColumn, anchorValue)
        .eq("whatsapp_account_id", accountRow.id as string);
      if (openOnly) {
        query = query.not("status", "in", `(${CLOSED_CONVERSATION_STATUSES.join(",")})`);
      }
      return query.order("last_message_at", { ascending: false }).limit(1).maybeSingle();
    };
    const { data: openConversation, error: openLookupErr } = await findConversationForInbound(true);
    if (openLookupErr) return transientDbFailure("inbound conversation lookup", openLookupErr);
    let existingConversation = openConversation;
    if (!existingConversation) {
      const { data: latestConversation, error: latestLookupErr } =
        await findConversationForInbound(false);
      if (latestLookupErr) {
        return transientDbFailure("inbound conversation lookup (any)", latestLookupErr);
      }
      existingConversation = latestConversation;
    }

    let conversationId: string;
    if (!existingConversation) {
      const { data: createdConversation, error: convErr } = await admin
        .from("conversations")
        .insert({
          store_id: accountRow.store_id,
          // Exactly one of customer_id / lead_id is set (app-level invariant).
          customer_id: anchorKind === "customer" ? anchorId : null,
          lead_id: anchorKind === "lead" ? String(anchorId) : null,
          whatsapp_account_id: accountRow.id,
          assigned_seller_id: null, // unassigned — lands in the pool/queue
          channel: "whatsapp",
          status: "aguardando",
          last_message_at: parsed.timestamp,
          unread_count: 0,
          ad_referral: parsed.adReferral ?? null,
        })
        .select("id")
        .single();
      if (convErr) {
        if (convErr.code === "23505") {
          // Lost a concurrent-create race: the partial unique index vetoed
          // this INSERT — the winner's row is the open conversation. Reuse it
          // (the bump below folds this message into it).
          const { data: raceWinner, error: raceErr } = await findConversationForInbound(true);
          if (raceErr || !raceWinner) {
            return transientDbFailure(
              "inbound race recovery",
              raceErr ?? { message: "unique violation but no open conversation found" },
            );
          }
          conversationId = raceWinner.id as string;
          existingConversation = raceWinner;
        } else {
          return transientDbFailure("inbound conversation insert", convErr);
        }
      } else {
        conversationId = createdConversation.id as string;
      }
    } else {
      conversationId = existingConversation.id as string;
      if (CLOSED_CONVERSATION_STATUSES.includes(existingConversation.status as string)) {
        // Reopen sets ONLY status/assignee — the last_message_at/unread bump
        // moved to the single post-insert bump below, so a 503 after a
        // successful reopen but failed message insert can't double-count
        // unread on the WAHA redelivery.
        const { error: reopenErr } = await admin
          .from("conversations")
          .update({ status: "aguardando", assigned_seller_id: null })
          .eq("id", conversationId);
        if (reopenErr && reopenErr.code === "23505") {
          // A concurrent event opened another conversation between the lookup
          // and this reopen — the unique index vetoed a second open row.
          // Route the message into the open winner instead of reopening.
          const { data: openWinner, error: openWinnerErr } = await findConversationForInbound(true);
          if (openWinnerErr || !openWinner) {
            return transientDbFailure(
              "inbound reopen recovery",
              openWinnerErr ?? { message: "unique violation but no open conversation found" },
            );
          }
          conversationId = openWinner.id as string;
          existingConversation = openWinner;
        } else if (reopenErr) {
          return transientDbFailure("inbound conversation reopen", reopenErr);
        }
      }
    }

    // ===== Message insert (Correction 3) — NO media_url at insert time ========
    // Quote resolution runs BEFORE the insert so the row lands complete (see
    // the echo path above for why a follow-up UPDATE would be worse).
    const inboundReplyTo = await resolveReplyRef(admin, conversationId, parsed.replyTo);

    const messageId = crypto.randomUUID();
    const { error: messageErr } = await admin.from("messages").insert({
      id: messageId,
      conversation_id: conversationId,
      direction: "in",
      author_type: "customer",
      // author_id is free text (no FK) — the resolved anchor id, customer OR
      // lead (mirrors whatsapp-webhook's insertInboundMessage, author_type
      // stays "customer" for both).
      author_id: anchorId,
      provider: "waha",
      text: parsed.text ?? "",
      media_type: ["text", "unknown"].includes(parsed.contentType) ? null : parsed.contentType,
      media_filename: parsed.mediaFilename ?? null,
      // A binary kind with no mediaId means WAHA's OWN download failed upstream
      // (expired CDN link) — attachMedia, which normally writes this column, is
      // skipped without a mediaId, so record the failure here instead of
      // leaving the row indistinguishable from a pending download. Structured
      // kinds (location/contact) legitimately carry no bytes and stay null.
      media_download_status:
        ["image", "audio", "video", "document"].includes(parsed.contentType) && !parsed.mediaId
          ? "failed"
          : null,
      status: "delivered",
      sent_at: parsed.timestamp,
      provider_message_id: parsed.providerMessageId,
      webhook_event_ids: [eventKey],
      reply_to: inboundReplyTo,
    });
    if (messageErr) {
      // 503 (not the old log-and-continue-200): WAHA redelivers and the event
      // reprocesses from scratch — markProcessed only runs after the row
      // actually lands, so the retry is clean (no duplicate: this insert
      // failed, nothing was written).
      return transientDbFailure("inbound message insert", messageErr);
    }
    // Mark processed only now that the message has actually landed — a retry
    // of this event while messageErr was set will reprocess cleanly.
    await markProcessed();

    // Bump last_message_at/unread_count AFTER the message actually landed —
    // exactly one increment per persisted message, in first delivery and in
    // WAHA redeliveries alike (the reopen above no longer folds the bump).
    if (existingConversation) {
      await admin
        .from("conversations")
        .update({
          last_message_at: parsed.timestamp,
          unread_count: ((existingConversation.unread_count as number | undefined) ?? 0) + 1,
          ...(parsed.adReferral ? { ad_referral: parsed.adReferral } : {}),
        })
        .eq("id", conversationId);
    }

    // ===== Ad provenance (PRD-217) ===========================================
    // The ad_referral writes above OVERWRITE the previous origin; record_ad_touch
    // APPENDS instead, so a customer returning through another campaign keeps
    // both. This webhook has its own flow and does NOT import the shared
    // _shared/whatsapp/webhook/core.ts contract (where the twin call lives), so
    // the call has to be repeated here by hand — and it must be, because in
    // production every conversation carrying an ad arrives through WAHA.
    //
    // Placed after markProcessed() (mirroring core.ts) and wrapped in its OWN
    // try/catch that swallows everything: attribution is best-effort and must
    // never change the webhook response nor skip the media download below.
    // messageId is a locally generated uuid and the insert above returns early
    // on failure, so the row always exists by the time we get here.
    if (parsed.adReferral) {
      try {
        const { error: adTouchErr } = await admin.rpc("record_ad_touch", {
          p_conversation_id: conversationId,
          p_message_id: messageId,
          p_occurred_at: parsed.timestamp,
          p_referral: parsed.adReferral,
          p_origin: "webhook",
        });
        if (adTouchErr) throw new Error(adTouchErr.message);
      } catch (err) {
        console.warn(
          JSON.stringify({
            level: "warn",
            msg: "waha webhook: ad touch record failed",
            conversationId,
            error: err instanceof Error ? err.message : String(err),
          }),
        );
      }
    }

    // ===== Media (separate step, never fails the webhook response) ============
    if (parsed.mediaId) {
      await attachMedia(parsed.mediaId, conversationId, messageId, parsed.contentType === "audio");
    }

    await logWebhookSuccess();
    return respond(json({ ok: true }, 200), {
      outcome: "processed",
      eventType: "message",
      requestPayload: envelope,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      JSON.stringify({ level: "error", msg: "waha webhook processing failed", error: message }),
    );
    if (err instanceof TransientDbError) {
      // Fail closed: no idempotency mark ran, so WAHA's redelivery reprocesses
      // the event cleanly instead of it failing open into a duplicate anchor.
      return respond(json({ error: "transient-db-error" }, 503), {
        outcome: "error",
        errorMessage: message,
        requestPayload: envelope,
      });
    }
    return respond(json({ status: "error-logged" }, 200), {
      outcome: "error",
      errorMessage: message,
      requestPayload: envelope,
    });
  }
});
