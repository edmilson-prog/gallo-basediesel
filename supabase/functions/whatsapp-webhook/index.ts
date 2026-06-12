/**
 * whatsapp-webhook — unified inbound webhook for Meta Cloud API and Evolution
 * API (PRD-114). PUBLIC by design (verify_jwt: false): authentication is the
 * provider-specific gate (Meta HMAC app secret / Evolution webhook secret or
 * IP allowlist), enforced fail-closed BEFORE anything touches the database.
 *
 * Routing:
 *   GET  /whatsapp-webhook/meta       → Meta verification handshake (hub.challenge)
 *   POST /whatsapp-webhook/meta       → Meta events (messages + statuses)
 *   POST /whatsapp-webhook/evolution  → Evolution events (messages.upsert/update)
 *
 * After the gates, processing delegates to the shared runtime-agnostic core
 * (`_shared/whatsapp/webhook/core.ts`, mirrored from src/providers/whatsapp).
 * Per PRD RF-090, internal processing errors still answer 200 (logged +
 * Sentry) — only auth/routing failures get 4xx, so Meta never retry-storms.
 *
 * Secrets (Vault-first via "Integrações & Chaves", env secret as fallback):
 *   WHATSAPP_META_APP_SECRET    — Meta APP-level secret signing all webhooks
 *   WHATSAPP_META_VERIFY_TOKEN  — Meta handshake verify token
 *   <credentials_ref>_WEBHOOK_SECRET — optional per-account Evolution HMAC
 *   EVOLUTION_ALLOWED_IPS       — comma-separated allowlist (fallback gate)
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";
import { bestEffortAudit } from "../_shared/audit.ts";
import { requiredEnv } from "../_shared/env.ts";
import { json } from "../_shared/http.ts";
import { createSecretResolver, type VaultSecretResolver } from "../_shared/secrets.ts";
import { createLogger, type Logger } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import { buildWhatsAppEngine } from "../_shared/whatsapp/build.ts";
import { hmacSha256Hex, timingSafeEqualStrings } from "../_shared/whatsapp/crypto.ts";
import { verifyMetaWebhookSignature } from "../_shared/whatsapp/meta/signature.ts";
import {
  processWebhookEvent,
  type IAccountRecord,
  type IWebhookDb,
} from "../_shared/whatsapp/webhook/core.ts";
import type { IEngineDeps, IIntegrationLogEntry } from "../_shared/whatsapp/types.ts";

const CLOSED_CONVERSATION_STATUSES = ["resolvida", "arquivada"];

// ===== Supabase-backed adapter for the shared core ==========================

function makeDb(admin: SupabaseClient, traceId: string): IWebhookDb {
  return {
    async isProcessed(eventKey) {
      const { data } = await admin
        .from("processed_events")
        .select("event_key")
        .eq("event_key", eventKey)
        .maybeSingle();
      return data !== null;
    },
    async markProcessed(eventKey) {
      await admin
        .from("processed_events")
        .upsert({ event_key: eventKey, trace_id: traceId }, { onConflict: "event_key" });
    },
    async findMetaAccount(phoneNumberId, accountPhoneDigits) {
      const { data } = await admin
        .from("whatsapp_accounts")
        .select("id, store_id, provider, phone_number, credentials_ref, provider_config, status")
        .eq("provider", "meta")
        .neq("status", "disconnected");
      const rows = data ?? [];
      const byConfig = phoneNumberId
        ? rows.find(
            (row) =>
              (row.provider_config as { phoneNumberId?: string } | null)?.phoneNumberId ===
              phoneNumberId,
          )
        : undefined;
      const byPhone = rows.find(
        (row) => String(row.phone_number).replace(/\D/g, "") === accountPhoneDigits,
      );
      const row = byConfig ?? byPhone;
      return row ? toAccountRecord(row) : null;
    },
    async findEvolutionAccount(instanceName) {
      if (!instanceName) return null;
      const { data } = await admin
        .from("whatsapp_accounts")
        .select("id, store_id, provider, phone_number, credentials_ref, provider_config, status")
        .eq("provider", "evolution")
        .neq("status", "disconnected");
      const row = (data ?? []).find(
        (candidate) =>
          (candidate.provider_config as { instanceName?: string } | null)?.instanceName ===
          instanceName,
      );
      return row ? toAccountRecord(row) : null;
    },
    async findEvolutionAccountAnyStatus(instanceName) {
      if (!instanceName) return null;
      const { data } = await admin
        .from("whatsapp_accounts")
        .select("id, store_id, provider, phone_number, credentials_ref, provider_config, status")
        .eq("provider", "evolution");
      const row = (data ?? []).find(
        (candidate) =>
          (candidate.provider_config as { instanceName?: string } | null)?.instanceName ===
          instanceName,
      );
      return row ? toAccountRecord(row) : null;
    },
    async setAccountConnectionStatus(accountId, status) {
      const { data } = await admin
        .from("whatsapp_accounts")
        .update({ status })
        .eq("id", accountId)
        .neq("status", status)
        .select("id");
      return (data?.length ?? 0) > 0;
    },
    async findCustomerByPhone(storeId, phoneDigits) {
      // Narrow by suffix in SQL, confirm exact digit match in code (phone
      // formatting in the base varies: +55..., (55) 9..., etc.).
      const { data } = await admin
        .from("customers")
        .select("id, seller_id, phone")
        .eq("store_id", storeId)
        .like("phone", `%${phoneDigits.slice(-8)}`);
      const row = (data ?? []).find(
        (candidate) => String(candidate.phone).replace(/\D/g, "") === phoneDigits,
      );
      return row ? { id: row.id as string, sellerId: row.seller_id as string } : null;
    },
    async resolveDefaultSellerId(storeId) {
      const { data: store } = await admin
        .from("stores")
        .select("manager_id")
        .eq("id", storeId)
        .maybeSingle();
      if (store?.manager_id) return store.manager_id as string;
      const { data: seller } = await admin
        .from("sellers")
        .select("id")
        .eq("store_id", storeId)
        .eq("active", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!seller) throw new Error(`store ${storeId} has no active seller for auto-assignment`);
      return seller.id as string;
    },
    async createPendingCustomer({ storeId, phone, sellerId }) {
      const { data, error } = await admin
        .from("customers")
        .insert({
          store_id: storeId,
          type: "b2c",
          phone,
          full_name: phone,
          seller_id: sellerId,
          status: "ativo",
          tags: ["pending_review"],
        })
        .select("id, seller_id")
        .single();
      if (error) throw new Error(`createPendingCustomer: ${error.message}`);
      return { id: data.id as string, sellerId: data.seller_id as string };
    },
    async findOpenConversation(customerId, accountId) {
      const { data } = await admin
        .from("conversations")
        .select("id")
        .eq("customer_id", customerId)
        .eq("whatsapp_account_id", accountId)
        .not("status", "in", `(${CLOSED_CONVERSATION_STATUSES.join(",")})`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data ? { id: data.id as string } : null;
    },
    async createConversation(input) {
      const { data, error } = await admin
        .from("conversations")
        .insert({
          store_id: input.storeId,
          customer_id: input.customerId,
          whatsapp_account_id: input.accountId,
          assigned_seller_id: input.assignedSellerId,
          channel: "whatsapp",
          status: input.status,
          last_message_at: input.lastMessageAt,
          unread_count: 0,
        })
        .select("id")
        .single();
      if (error) throw new Error(`createConversation: ${error.message}`);
      return { id: data.id as string };
    },
    async insertInboundMessage(input) {
      const { data, error } = await admin
        .from("messages")
        .insert({
          conversation_id: input.conversationId,
          direction: "in",
          author_type: "customer",
          author_id: input.customerId,
          provider: input.provider,
          text: input.text,
          media_type: input.mediaType,
          status: "delivered",
          sent_at: input.sentAt,
          provider_message_id: input.providerMessageId,
          webhook_event_ids: [input.eventKey],
        })
        .select("id")
        .single();
      if (error) throw new Error(`insertInboundMessage: ${error.message}`);
      return { id: data.id as string };
    },
    async insertOutboundEchoMessage(input) {
      const { data, error } = await admin
        .from("messages")
        .insert({
          conversation_id: input.conversationId,
          direction: "out",
          author_type: "seller",
          author_id: null,
          provider: input.provider,
          text: input.text,
          media_type: input.mediaType,
          status: "sent",
          sent_at: input.sentAt,
          provider_message_id: input.providerMessageId,
          webhook_event_ids: [input.eventKey],
        })
        .select("id")
        .single();
      if (error) throw new Error(`insertOutboundEchoMessage: ${error.message}`);
      return { id: data.id as string };
    },
    async touchConversation(conversationId, lastMessageAt) {
      // Advance-only: a late echo must never walk last_message_at backwards.
      await admin
        .from("conversations")
        .update({ last_message_at: lastMessageAt, updated_at: new Date().toISOString() })
        .eq("id", conversationId)
        .lt("last_message_at", lastMessageAt);
    },
    async bumpConversation(conversationId, lastMessageAt) {
      const { data } = await admin
        .from("conversations")
        .select("unread_count")
        .eq("id", conversationId)
        .maybeSingle();
      await admin
        .from("conversations")
        .update({
          last_message_at: lastMessageAt,
          unread_count: ((data?.unread_count as number | undefined) ?? 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", conversationId);
    },
    async findOutboundMessageByProviderMessageId(providerMessageId) {
      const { data } = await admin
        .from("messages")
        .select("id, conversation_id, conversations(customer_id, store_id)")
        .eq("provider_message_id", providerMessageId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!data) return null;
      const conv = data.conversations as { customer_id?: string; store_id?: string } | null;
      return {
        id: data.id as string,
        conversationId: data.conversation_id as string,
        customerId: conv?.customer_id ?? null,
        storeId: conv?.store_id ?? null,
      };
    },
    async applyStatusToMessage(input) {
      const { data } = await admin
        .from("messages")
        .select("webhook_event_ids")
        .eq("id", input.messageId)
        .maybeSingle();
      const eventIds = [
        ...((data?.webhook_event_ids as string[] | undefined) ?? []),
        input.eventKey,
      ];
      const patch: Record<string, unknown> = {
        status: input.status,
        webhook_event_ids: eventIds,
      };
      if (input.status === "delivered") patch.delivered_at = input.timestamp;
      if (input.status === "read") patch.read_at = input.timestamp;
      if (input.status === "failed" && input.failureReason) {
        patch.failure_reason = input.failureReason;
      }
      if (input.status === "failed" && input.failureCode) {
        patch.failure_code = input.failureCode;
      }
      await admin.from("messages").update(patch).eq("id", input.messageId);
    },
    async markCustomerWhatsappInvalid(customerId) {
      await admin.from("customers").update({ whatsapp_status: "invalid" }).eq("id", customerId);
    },
    async setMessageMedia(messageId, mediaUrl, downloadStatus) {
      await admin
        .from("messages")
        .update({ media_url: mediaUrl, media_download_status: downloadStatus })
        .eq("id", messageId);
    },
    async uploadMedia(path, data, mimeType) {
      const { error } = await admin.storage
        .from("whatsapp-media")
        .upload(path, data.buffer as ArrayBuffer, { contentType: mimeType, upsert: true });
      if (error) throw new Error(`uploadMedia: ${error.message}`);
    },
    async audit(input) {
      await bestEffortAudit(admin, {
        store_id: input.storeId,
        actor_id: "integration:whatsapp-webhook",
        action: input.action,
        resource: input.resource,
        resource_id: input.resourceId,
        after: input.after,
      });
    },
  };
}

function toAccountRecord(row: Record<string, unknown>): IAccountRecord {
  return {
    id: row.id as string,
    storeId: row.store_id as string,
    provider: row.provider as "meta" | "evolution",
    phoneNumber: row.phone_number as string,
    credentialsRef: row.credentials_ref as string,
    providerConfig: (row.provider_config as Record<string, unknown> | null) ?? null,
  };
}

// ===== Engine deps (media download) =========================================

function makeEngineDeps(admin: SupabaseClient, traceId: string): IEngineDeps {
  return {
    // Vault-first ("Integrações & Chaves"), env secret as fallback.
    resolveSecret: createSecretResolver(admin),
    logIntegration: async (entry: IIntegrationLogEntry) => {
      await admin.from("integration_logs").insert({
        integration_name: entry.integrationName,
        direction: entry.direction,
        endpoint: entry.endpoint,
        http_status: entry.httpStatus,
        latency_ms: entry.latencyMs,
        trace_id: entry.traceId ?? traceId,
        request_payload: entry.requestPayload,
        response_payload: entry.responsePayload,
        error_message: entry.errorMessage,
      });
    },
  };
}

// ===== Gates ================================================================

async function metaHandshake(url: URL, resolveSecret: VaultSecretResolver): Promise<Response> {
  const verifyToken = await resolveSecret("WHATSAPP_META_VERIFY_TOKEN");
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token") ?? "";
  const challenge = url.searchParams.get("hub.challenge") ?? "";
  if (verifyToken && mode === "subscribe" && timingSafeEqualStrings(token, verifyToken)) {
    return new Response(challenge, { status: 200 });
  }
  return json({ error: "forbidden" }, 403);
}

async function metaGate(
  req: Request,
  rawBody: string,
  log: Logger,
  resolveSecret: VaultSecretResolver,
): Promise<Response | null> {
  const appSecret = await resolveSecret("WHATSAPP_META_APP_SECRET");
  if (!appSecret) {
    log.error("WHATSAPP_META_APP_SECRET not configured — rejecting webhook (fail closed)");
    return json({ error: "webhook not configured" }, 403);
  }
  const signature = req.headers.get("x-hub-signature-256") ?? "";
  const valid = await verifyMetaWebhookSignature(rawBody, signature, appSecret);
  if (!valid) {
    log.warn("invalid meta webhook signature");
    return json({ error: "invalid signature" }, 403);
  }
  return null;
}

async function evolutionGate(
  req: Request,
  rawBody: string,
  account: IAccountRecord | null,
  log: Logger,
  resolveSecret: VaultSecretResolver,
): Promise<Response | null> {
  // Per-account webhook secret (preferred when configured on the instance).
  const secret = account
    ? await resolveSecret(`${account.credentialsRef}_WEBHOOK_SECRET`)
    : undefined;
  if (secret) {
    const provided = (req.headers.get("x-webhook-signature") ?? "").replace(/^sha256=/, "");
    const expected = await hmacSha256Hex(secret, rawBody);
    if (provided && timingSafeEqualStrings(provided, expected)) return null;
    log.warn("invalid evolution webhook signature");
    return json({ error: "invalid signature" }, 403);
  }
  // Fallback gate: source IP allowlist (RF-011).
  const allowlist = ((await resolveSecret("EVOLUTION_ALLOWED_IPS")) ?? "")
    .split(",")
    .map((ip) => ip.trim())
    .filter(Boolean);
  const sourceIp = (req.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ?? "";
  if (allowlist.length > 0) {
    if (allowlist.includes(sourceIp)) return null;
    log.warn("evolution webhook from non-allowlisted ip", { sourceIp });
    return json({ error: "forbidden" }, 403);
  }
  // Neither secret nor allowlist configured: fail closed. The sourceIp in the
  // log is what an operator must allowlist (EVOLUTION_ALLOWED_IPS).
  log.error("evolution webhook validation not configured — rejecting (fail closed)", { sourceIp });
  return json({ error: "webhook not configured" }, 403);
}

// ===== Server ===============================================================

Deno.serve(async (req) => {
  const traceId = req.headers.get("x-trace-id") ?? crypto.randomUUID();
  const log = createLogger(traceId);
  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean);
  const provider = segments[segments.indexOf("whatsapp-webhook") + 1] ?? "";

  const respond = (res: Response) => {
    res.headers.set("x-trace-id", traceId);
    return res;
  };

  if (provider !== "meta" && provider !== "evolution") {
    return respond(json({ error: "unknown provider" }, 400));
  }

  const admin = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));
  // Per-request resolver: Vault-first ("Integrações & Chaves"), env fallback.
  const resolveSecret = createSecretResolver(admin);

  if (req.method === "GET" && provider === "meta") {
    return respond(await metaHandshake(url, resolveSecret));
  }
  if (req.method !== "POST") {
    return respond(json({ error: "method not allowed" }, 405));
  }

  const rawBody = await req.text();
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return respond(json({ error: "invalid json body" }, 400));
  }

  const db = makeDb(admin, traceId);

  // Auth gates (fail closed) — the ONLY paths that answer 4xx on POST.
  if (provider === "meta") {
    const rejection = await metaGate(req, rawBody, log, resolveSecret);
    if (rejection) return respond(rejection);
  } else {
    // Any-status lookup: the gate is about AUTH (per-account secret), and
    // connection.update events must also reach disconnected accounts.
    const instance = (payload as { instance?: string } | null)?.instance ?? "";
    const account = await db.findEvolutionAccountAnyStatus(instance);
    const rejection = await evolutionGate(req, rawBody, account, log, resolveSecret);
    if (rejection) return respond(rejection);
  }

  // From here on: always 200 (RF-090) — Meta must never retry-storm us.
  try {
    const result = await processWebhookEvent({
      provider,
      rawPayload: payload,
      db,
      buildProvider: (account) =>
        buildWhatsAppEngine({
          engine: account.provider,
          accountId: account.id,
          providerConfig: account.providerConfig,
          credentialsRef: account.credentialsRef,
          deps: makeEngineDeps(admin, traceId),
        }),
      traceId,
      warn: (msg, fields) => log.warn(msg, fields),
    });
    log.info("webhook processed", { provider, outcome: result.outcome });
    return respond(json({ status: "ok", outcome: result.outcome, traceId }, 200));
  } catch (err) {
    log.error("webhook processing failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    captureException(err, { traceId, functionName: "whatsapp-webhook" });
    return respond(json({ status: "error-logged", traceId }, 200));
  }
});
