/**
 * waha-webhook — public inbound endpoint for WAHA session events.
 *
 * FULLY ISOLATED: does not import `_shared/whatsapp/webhook/core.ts`,
 * `_shared/whatsapp/build.ts` or `_shared/whatsapp/send/core.ts`, nor
 * anything from `whatsapp-webhook/`. Only generic platform primitives
 * (_shared/http.ts, _shared/secrets.ts, _shared/env.ts) and the
 * self-contained `_shared/whatsapp/waha/*` engine are used. Fail-closed on a
 * bad/missing HMAC signature — no DB write happens before it's verified.
 *
 * Handles three event kinds:
 *   - "message": an inbound customer message (persisted with
 *     reuse-or-reopen-or-create conversation semantics).
 *   - "message.any": WAHA's (GOWS engine) only channel for `fromMe: true`
 *     messages — someone replied straight from the paired phone, outside the
 *     platform. Plain "message" never carries these. Mirrored with
 *     open-only-lookup semantics so it never reopens a closed conversation;
 *     any "message.any" envelope that turns out NOT to be an echo (i.e.
 *     genuine inbound, already covered by "message") is ignored to avoid
 *     double-processing.
 *   Both message paths land in the same conversations/messages tables the
 *   rest of the Inbox reads, with a separate media download step. Mirrors the
 *   real `whatsapp-webhook` function's tested contract (see
 *   _shared/whatsapp/webhook/core.ts).
 *   - "session.status": updates whatsapp_accounts.status.
 * Any other envelope event is acknowledged (200) and ignored.
 *
 * Spec: docs/superpowers/specs/2026-07-10-waha-whatsapp-integration-design.md
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";
import { requiredEnv } from "../_shared/env.ts";
import { json } from "../_shared/http.ts";
import { createSecretResolver } from "../_shared/secrets.ts";
import { downloadWahaMedia } from "../_shared/whatsapp/waha/media.ts";
import { parseWahaMessageEvent } from "../_shared/whatsapp/waha/parser.ts";
import { verifyWahaHmac } from "../_shared/whatsapp/waha/hmac.ts";
import { wahaStateToAccountStatus } from "../_shared/whatsapp/waha/constants.ts";
import { getWahaContactName, resolveWahaLid } from "../_shared/whatsapp/waha/contacts.ts";
import { buildWahaEventKey } from "../_shared/whatsapp/waha/eventKey.ts";
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
    runInBackground(logWebhookDelivery(admin, {
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
    }));
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

    // Shared phone→customer lookup (suffix pre-filter + exact digit match —
    // phone formatting varies in the base: +55..., (55) 9..., etc.). Used by
    // both the inbound-message and outbound-echo paths below.
    async function findCustomerByPhone(phoneDigits: string): Promise<string | undefined> {
      const { data: candidates } = await admin
        .from("customers")
        .select("id, phone")
        .eq("store_id", accountRow.store_id as string)
        .like("phone", `%${phoneDigits.slice(-8)}`);
      return (candidates ?? []).find((c) => String(c.phone).replace(/\D/g, "") === phoneDigits)
        ?.id as string | undefined;
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
      const { data: existingOutbound } = await admin
        .from("messages")
        .select("id")
        .eq("provider_message_id", parsed.providerMessageId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existingOutbound) {
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

      let echoCustomerId = await findCustomerByPhone(echoPhoneDigits);
      if (!echoCustomerId) {
        // Same anchor-only contract as the inbound path: no seller_id (wallet
        // owner) and tags:["pending_review"] — a human converts it manually.
        // An unresolved lid must NEVER surface its digits as a name (spec §5
        // risk 3) — same neutral pt-BR label as the inbound fallback.
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
          console.warn(
            JSON.stringify({
              level: "warn",
              msg: "waha webhook: echo customer insert failed",
              error: echoCustomerErr.message,
            }),
          );
          return respond(json({ ok: true, ignored: "echo-customer-insert-failed" }, 200), {
            outcome: "ignored",
            errorMessage: echoCustomerErr.message,
            requestPayload: envelope,
          });
        }
        echoCustomerId = createdEchoCustomer.id as string;
      }

      // OPEN-ONLY lookup (excludes resolvida/arquivada): an echo is
      // business-sent and must NEVER reopen a closed conversation — it spawns
      // a fresh one instead, same rule as the reference `whatsapp-webhook`
      // pipeline (spec 2026-07-03 §1.5).
      const { data: openEchoConversation } = await admin
        .from("conversations")
        .select("id")
        .eq("customer_id", echoCustomerId)
        .eq("whatsapp_account_id", accountRow.id as string)
        .not("status", "in", `(${CLOSED_CONVERSATION_STATUSES.join(",")})`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let echoConversationId: string;
      if (!openEchoConversation) {
        const { data: createdEchoConversation, error: echoConvErr } = await admin
          .from("conversations")
          .insert({
            store_id: accountRow.store_id,
            customer_id: echoCustomerId,
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
          console.warn(
            JSON.stringify({
              level: "warn",
              msg: "waha webhook: echo conversation insert failed",
              error: echoConvErr.message,
            }),
          );
          return respond(json({ ok: true, ignored: "echo-conversation-insert-failed" }, 200), {
            outcome: "ignored",
            errorMessage: echoConvErr.message,
            requestPayload: envelope,
          });
        }
        echoConversationId = createdEchoConversation.id as string;
      } else {
        echoConversationId = openEchoConversation.id as string;
      }

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
        status: "sent",
        sent_at: parsed.timestamp,
        provider_message_id: parsed.providerMessageId,
        webhook_event_ids: [eventKey],
      });
      if (echoMessageErr) {
        console.warn(
          JSON.stringify({
            level: "warn",
            msg: "waha webhook: echo message insert failed",
            error: echoMessageErr.message,
          }),
        );
        return respond(json({ ok: true, ignored: "echo-message-insert-failed" }, 200), {
          outcome: "ignored",
          errorMessage: echoMessageErr.message,
          requestPayload: envelope,
        });
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
    let customerId = await findCustomerByPhone(phoneDigits);
    if (!customerId) {
      // Seed the display name from the WhatsApp contact (pushname) — best-effort,
      // one extra GET only on the new-customer path. The lid id is the known-good
      // identity when present (the contacts endpoint accepts @lid directly).
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

      // NO seller_id (wallet owner) — this anchors a pool conversation only,
      // until a human manually converts it. tags:["pending_review"] is what the
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
        console.warn(
          JSON.stringify({
            level: "warn",
            msg: "waha webhook: customer insert failed",
            error: customerErr.message,
          }),
        );
        return respond(json({ ok: true, ignored: "customer-insert-failed" }, 200), {
          outcome: "ignored",
          errorMessage: customerErr.message,
          requestPayload: envelope,
        });
      }
      customerId = createdCustomer.id as string;
    }

    // ===== Conversation resolution: reuse-or-reopen-or-create (Correction 2) ===
    const { data: existingConversation } = await admin
      .from("conversations")
      .select("id, status, unread_count")
      .eq("customer_id", customerId)
      .eq("whatsapp_account_id", accountRow.id as string)
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let conversationId: string;
    let didReopen = false;
    if (!existingConversation) {
      const { data: createdConversation, error: convErr } = await admin
        .from("conversations")
        .insert({
          store_id: accountRow.store_id,
          customer_id: customerId,
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
        console.warn(
          JSON.stringify({
            level: "warn",
            msg: "waha webhook: conversation insert failed",
            error: convErr.message,
          }),
        );
        return respond(json({ ok: true, ignored: "conversation-insert-failed" }, 200), {
          outcome: "ignored",
          errorMessage: convErr.message,
          requestPayload: envelope,
        });
      }
      conversationId = createdConversation.id as string;
    } else {
      conversationId = existingConversation.id as string;
      if (CLOSED_CONVERSATION_STATUSES.includes(existingConversation.status as string)) {
        await admin
          .from("conversations")
          .update({
            status: "aguardando",
            assigned_seller_id: null,
            last_message_at: parsed.timestamp,
            unread_count: ((existingConversation.unread_count as number | undefined) ?? 0) + 1,
            ...(parsed.adReferral ? { ad_referral: parsed.adReferral } : {}),
          })
          .eq("id", conversationId);
        didReopen = true;
      }
    }

    // ===== Message insert (Correction 3) — NO media_url at insert time ========
    const messageId = crypto.randomUUID();
    const { error: messageErr } = await admin.from("messages").insert({
      id: messageId,
      conversation_id: conversationId,
      direction: "in",
      author_type: "customer",
      author_id: customerId,
      provider: "waha",
      text: parsed.text ?? "",
      media_type: ["text", "unknown"].includes(parsed.contentType) ? null : parsed.contentType,
      media_filename: parsed.mediaFilename ?? null,
      status: "delivered",
      sent_at: parsed.timestamp,
      provider_message_id: parsed.providerMessageId,
      webhook_event_ids: [eventKey],
    });
    if (messageErr) {
      console.warn(
        JSON.stringify({
          level: "warn",
          msg: "waha webhook: message insert failed",
          error: messageErr.message,
        }),
      );
    } else {
      // Mark processed only now that the message has actually landed — a
      // retry of this event while messageErr was set will reprocess cleanly.
      await markProcessed();
    }

    // Bump last_message_at/unread_count unless the reopen above already folded
    // it in.
    if (!didReopen && existingConversation) {
      await admin
        .from("conversations")
        .update({
          last_message_at: parsed.timestamp,
          unread_count: ((existingConversation.unread_count as number | undefined) ?? 0) + 1,
          ...(parsed.adReferral ? { ad_referral: parsed.adReferral } : {}),
        })
        .eq("id", conversationId);
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
    return respond(json({ status: "error-logged" }, 200), {
      outcome: "error",
      errorMessage: message,
      requestPayload: envelope,
    });
  }
});
