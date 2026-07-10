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
 * Handles two event kinds:
 *   - "message": persisted into conversations/messages (same tables the rest
 *     of the Inbox reads — this is what puts WAHA sessions in the same
 *     Atendimento screen). Reuse-or-reopen-or-create conversation semantics
 *     and a separate media download step mirror the real `whatsapp-webhook`
 *     function's tested contract (see _shared/whatsapp/webhook/core.ts).
 *   - "session.status": updates whatsapp_accounts.status.
 * Any other event is acknowledged (200) and ignored.
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
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const admin = createClient(
    requiredEnv("SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: { persistSession: false },
    },
  );
  const resolveSecret = createSecretResolver(admin);

  const rawBody = await req.text();
  let envelope: IWahaEnvelope;
  try {
    envelope = JSON.parse(rawBody) as IWahaEnvelope;
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }
  if (!envelope.session || !envelope.event) {
    return json({ error: "missing session/event" }, 400);
  }

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
    return json({ error: "unknown session" }, 401);
  }

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
    return json({ error: "server not configured" }, 401);
  }

  // ===== HMAC verification (fail-closed, BEFORE any DB write below) =========
  const hmacKey = await resolveSecret(String(server.webhook_hmac_ref));
  if (!hmacKey) return json({ error: "server not configured" }, 401);

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
    return json({ error: "invalid signature" }, 401);
  }

  // ===== Idempotency — CHECK is early (read-only), MARK is deferred =========
  // Scoped by account id, not just provider — the "eco de mídia" lesson: an
  // unscoped key lets two sessions racing on the same envelope id swallow
  // each other's event.
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
  const eventKey = `whatsapp:waha:${accountRow.id}:${envelope.id ?? crypto.randomUUID()}`;
  const { data: alreadyProcessed } = await admin
    .from("processed_events")
    .select("event_key")
    .eq("event_key", eventKey)
    .maybeSingle();
  if (alreadyProcessed) return json({ ok: true, duplicate: true }, 200);

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

  if (envelope.event === "session.status") {
    const payload = envelope.payload as { status?: string } | null;
    const accountStatus = wahaStateToAccountStatus(String(payload?.status ?? ""));
    const { error: statusErr } = await admin
      .from("whatsapp_accounts")
      .update({ status: accountStatus })
      .eq("id", accountRow.id);
    if (!statusErr) await markProcessed();
    return json({ ok: true }, 200);
  }

  if (envelope.event !== "message") {
    // No persistent work happens for unknown event types — safe to mark so a
    // WAHA retry of the same envelope doesn't repeat the (harmless) parse.
    await markProcessed();
    return json({ ok: true, ignored: envelope.event }, 200);
  }

  let parsed;
  try {
    parsed = parseWahaMessageEvent(envelope.payload, accountRow.id as string);
  } catch (err) {
    console.warn(
      JSON.stringify({
        level: "warn",
        msg: "waha webhook: unparseable message",
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    await markProcessed();
    return json({ ok: true, ignored: "unparseable" }, 200);
  }

  if (parsed.type === "outbound-echo") {
    // Phase 1: echoes from the phone/companion app are acknowledged but not
    // mirrored — mirroring is deferred (matches the design doc's phase-2 list).
    await markProcessed();
    return json({ ok: true, ignored: "outbound-echo" }, 200);
  }

  const fromPhone = parsed.fromPhone;
  if (!fromPhone) {
    await markProcessed();
    return json({ ok: true, ignored: "no-phone" }, 200);
  }
  const phoneDigits = fromPhone.replace(/\D/g, "");

  // ===== Customer resolution (Correction 1) ==================================
  // Find by suffix pre-filter + exact digit match in code — phone formatting
  // varies in the base (+55..., (55) 9..., etc.).
  const { data: candidateCustomers } = await admin
    .from("customers")
    .select("id, phone")
    .eq("store_id", accountRow.store_id as string)
    .like("phone", `%${phoneDigits.slice(-8)}`);
  const existingCustomer = (candidateCustomers ?? []).find(
    (c) => String(c.phone).replace(/\D/g, "") === phoneDigits,
  );

  let customerId = existingCustomer?.id as string | undefined;
  if (!customerId) {
    // NO seller_id (wallet owner) — this anchors a pool conversation only,
    // until a human manually converts it. tags:["pending_review"] is what the
    // Customers list UI filters out by default.
    const { data: createdCustomer, error: customerErr } = await admin
      .from("customers")
      .insert({
        store_id: accountRow.store_id,
        type: "B2C", // customers_type_check requires UPPERCASE 'B2C'
        phone: fromPhone,
        full_name: fromPhone, // WAHA v1 has no contact-name field to seed from; phone is the placeholder
        whatsapp_name: null,
        status: "ativo",
        tags: ["pending_review"],
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
      return json({ ok: true, ignored: "customer-insert-failed" }, 200);
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
      return json({ ok: true, ignored: "conversation-insert-failed" }, 200);
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
      })
      .eq("id", conversationId);
  }

  // ===== Media (separate step, never fails the webhook response) ============
  if (parsed.mediaId) {
    try {
      const apiKey = await resolveSecret(String(server.api_key_ref));
      if (!apiKey) throw new Error("missing server api key");
      const media = await downloadWahaMedia(apiKey, globalThis.fetch, parsed.mediaId);
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

  await admin.from("integration_logs").insert({
    integration_name: "whatsapp_waha",
    direction: "inbound",
    endpoint: "/waha-webhook",
    http_status: 200,
    trace_id: null,
    request_payload: { event: envelope.event, session: envelope.session },
  });

  return json({ ok: true }, 200);
});
