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
import { syncContactAvatar } from "../_shared/avatar.ts";
import { requiredEnv } from "../_shared/env.ts";
import { json } from "../_shared/http.ts";
import { createSecretResolver, type VaultSecretResolver } from "../_shared/secrets.ts";
import { createLogger, type Logger } from "../_shared/logger.ts";
import { captureException } from "../_shared/sentry.ts";
import { buildWhatsAppEngine } from "../_shared/whatsapp/build.ts";
import { statusAdvances, type DeliveryStatus } from "../_shared/whatsapp/messageStatus.ts";
import { hmacSha256Hex, timingSafeEqualStrings } from "../_shared/whatsapp/crypto.ts";
import { verifyMetaWebhookSignature } from "../_shared/whatsapp/meta/signature.ts";
import { EvolutionGoProvider } from "../_shared/whatsapp/evolution-go/EvolutionGoProvider.ts";
import {
  processWebhookEvent,
  type IAccountRecord,
  type IWebhookDb,
} from "../_shared/whatsapp/webhook/core.ts";
import type { IEngineDeps, IIntegrationLogEntry } from "../_shared/whatsapp/types.ts";

// Columns selected when resolving an account from an inbound event.
const ACCT_COLS = "id, store_id, provider, phone_number, credentials_ref, provider_config, status";

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
      if (phoneNumberId) {
        const { data } = await admin
          .from("whatsapp_accounts")
          .select(ACCT_COLS)
          .eq("provider", "meta")
          .neq("status", "disconnected")
          .eq("provider_config->>phoneNumberId", phoneNumberId);
        const rows = data ?? [];
        if (rows.length > 1) {
          console.warn(
            JSON.stringify({
              level: "warn",
              msg: "ambiguous meta phoneNumberId — refusing to route",
              phoneNumberId,
              count: rows.length,
            }),
          );
          return null; // fail-closed: ambíguo não roteia
        }
        const [match] = rows;
        if (match) return toAccountRecord(match);
        // 0 matches por phoneNumberId → cai no fallback legado por telefone
      }
      // Fallback legado: por dígitos do telefone (contas sem phoneNumberId no config).
      const { data } = await admin
        .from("whatsapp_accounts")
        .select(ACCT_COLS)
        .eq("provider", "meta")
        .neq("status", "disconnected");
      const matches = (data ?? []).filter(
        (row) => String(row.phone_number).replace(/\D/g, "") === accountPhoneDigits,
      );
      if (matches.length > 1) {
        console.warn(
          JSON.stringify({
            level: "warn",
            msg: "ambiguous meta phone fallback — refusing to route",
            count: matches.length,
          }),
        );
        return null;
      }
      const [only] = matches;
      return only ? toAccountRecord(only) : null;
    },
    async findEvolutionAccount(instanceName) {
      if (!instanceName) return null;
      const { data } = await admin
        .from("whatsapp_accounts")
        .select(ACCT_COLS)
        .eq("provider", "evolution")
        .neq("status", "disconnected")
        .eq("provider_config->>instanceName", instanceName);
      const rows = data ?? [];
      if (rows.length > 1) {
        console.warn(
          JSON.stringify({
            level: "warn",
            msg: "ambiguous evolution instanceName — refusing to route",
            instanceName,
            count: rows.length,
          }),
        );
        return null; // fail-closed: ambíguo não roteia
      }
      const row = rows[0];
      return row ? toAccountRecord(row) : null;
    },
    async findEvolutionAccountAnyStatus(instanceName) {
      if (!instanceName) return null;
      const { data } = await admin
        .from("whatsapp_accounts")
        .select(ACCT_COLS)
        .eq("provider", "evolution")
        .eq("provider_config->>instanceName", instanceName);
      const rows = data ?? [];
      if (rows.length > 1) {
        console.warn(
          JSON.stringify({
            level: "warn",
            msg: "ambiguous evolution instanceName (any status) — refusing to route",
            instanceName,
            count: rows.length,
          }),
        );
        return null; // fail-closed: ambíguo não roteia
      }
      const row = rows[0];
      return row ? toAccountRecord(row) : null;
    },
    async findEvolutionGoAccount(instanceId) {
      if (!instanceId) return null;
      const { data } = await admin
        .from("whatsapp_accounts")
        .select(ACCT_COLS)
        .eq("provider", "evolution-go")
        .neq("status", "disconnected")
        .eq("provider_config->>instanceId", instanceId);
      const rows = data ?? [];
      if (rows.length > 1) {
        console.warn(
          JSON.stringify({
            level: "warn",
            msg: "ambiguous evolution-go instanceId — refusing to route",
            instanceId,
            count: rows.length,
          }),
        );
        return null; // fail-closed: ambíguo não roteia
      }
      const row = rows[0];
      return row ? toAccountRecord(row) : null;
    },
    async findEvolutionGoAccountAnyStatus(instanceId) {
      if (!instanceId) return null;
      const { data } = await admin
        .from("whatsapp_accounts")
        .select(ACCT_COLS)
        .eq("provider", "evolution-go")
        .eq("provider_config->>instanceId", instanceId);
      const rows = data ?? [];
      if (rows.length > 1) {
        console.warn(
          JSON.stringify({
            level: "warn",
            msg: "ambiguous evolution-go instanceId (any status) — refusing to route",
            instanceId,
            count: rows.length,
          }),
        );
        return null; // fail-closed: ambíguo não roteia
      }
      const row = rows[0];
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
        .select("id, phone")
        .eq("store_id", storeId)
        .like("phone", `%${phoneDigits.slice(-8)}`);
      const row = (data ?? []).find(
        (candidate) => String(candidate.phone).replace(/\D/g, "") === phoneDigits,
      );
      return row ? { id: row.id as string } : null;
    },
    async createPendingCustomer({ storeId, phone, name }) {
      const { data, error } = await admin
        .from("customers")
        .insert({
          store_id: storeId,
          // customers_type_check requires uppercase 'B2C' (matches the app/seed).
          type: "B2C",
          phone,
          // Name the contact from its WhatsApp profile when known; the phone is
          // only a last-resort placeholder.
          full_name: name ?? phone,
          // whatsapp_name holds the live profile name only (no phone fallback).
          whatsapp_name: name ?? null,
          // No wallet owner: imported anchors carry seller_id null until a manual
          // conversion assigns a real seller (customers.seller_id is nullable).
          status: "ativo",
          tags: ["pending_review"],
        })
        .select("id")
        .single();
      if (error) throw new Error(`createPendingCustomer: ${error.message}`);
      return { id: data.id as string };
    },
    async applyInboundContactName(customerId, name) {
      // Read first so a manually-entered display name is never overwritten.
      // Best-effort — callers swallow errors.
      const { data } = await admin
        .from("customers")
        .select("full_name, phone, whatsapp_name")
        .eq("id", customerId)
        .maybeSingle();
      if (!data) return;
      const patch: Record<string, unknown> = {};
      // 1) Always keep whatsapp_name in sync with the live WhatsApp profile name.
      if (String(data.whatsapp_name ?? "") !== name) patch.whatsapp_name = name;
      // 2) Heal the display name only while it's still the phone placeholder.
      const fullName = String(data.full_name ?? "").trim();
      const nameDigits = fullName.replace(/\D/g, "");
      const phoneDigits = String(data.phone ?? "").replace(/\D/g, "");
      const isPlaceholder =
        fullName === "" || (!/\p{L}/u.test(fullName) && nameDigits === phoneDigits);
      if (isPlaceholder) patch.full_name = name;
      if (Object.keys(patch).length === 0) return;
      await admin.from("customers").update(patch).eq("id", customerId);
    },
    async findOpenConversation(customerId, accountId) {
      // Reuses the latest conversation regardless of status — a closed one
      // (resolvida/arquivada) is REOPENED by reopenConversation below rather
      // than filtered out here (spec 2026-07-03 §1.5).
      const { data } = await admin
        .from("conversations")
        .select("id, status")
        .eq("customer_id", customerId)
        .eq("whatsapp_account_id", accountId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data ? { id: data.id as string, status: data.status as string } : null;
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
          media_filename: input.mediaFilename ?? null,
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
          media_filename: input.mediaFilename ?? null,
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
    async reopenConversation(conversationId, lastMessageAt) {
      // Reopen a closed conversation on customer inbound: back to the queue
      // (status='aguardando'), unassigned (previous owner loses the closed
      // chat), unread bumped. The conversation_status_activity trigger emits
      // the 'reopen' activity row (service_role ⇒ actor_kind='system').
      const { data } = await admin
        .from("conversations")
        .select("unread_count")
        .eq("id", conversationId)
        .maybeSingle();
      await admin
        .from("conversations")
        .update({
          status: "aguardando",
          assigned_seller_id: null,
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
        .select("status, webhook_event_ids")
        .eq("id", input.messageId)
        .maybeSingle();
      const eventIds = [
        ...((data?.webhook_event_ids as string[] | undefined) ?? []),
        input.eventKey,
      ];
      // Always record the event id, but only ADVANCE the status: `failed` is
      // recoverable (Baileys emits a spurious ERROR ack mid-flight), so it must
      // never clobber an already delivered/read message — see statusAdvances.
      const current = (data?.status as DeliveryStatus | undefined) ?? "queued";
      const patch: Record<string, unknown> = { webhook_event_ids: eventIds };
      if (statusAdvances(current, input.status)) {
        patch.status = input.status;
        // A forward confirmation clears any stale failure left by a transient ack.
        if (input.status === "delivered") {
          patch.delivered_at = input.timestamp;
          patch.failure_reason = null;
          patch.failure_code = null;
        }
        if (input.status === "read") {
          patch.read_at = input.timestamp;
          patch.failure_reason = null;
          patch.failure_code = null;
        }
        if (input.status === "failed" && input.failureReason) {
          patch.failure_reason = input.failureReason;
        }
        if (input.status === "failed" && input.failureCode) {
          patch.failure_code = input.failureCode;
        }
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
    provider: row.provider as "meta" | "evolution" | "evolution-go",
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
  // Primary gate: shared URL token (IP-independent). The webhook URL we register
  // on the Evolution server carries `?token=<T>` (see buildEvolutionWebhookUrl in
  // whatsapp-connect), so the server echoes it back on every post. This survives
  // VPS egress-IP changes — unlike the IP allowlist below, which silently broke
  // when the server's IP moved on 2026-06-23. A present, matching token
  // authenticates; an absent/mismatched token falls through to the legacy gates,
  // so instances not yet re-armed with a token keep working (zero-downtime
  // rollout). Keep the token name in sync with whatsapp-connect.
  const expectedToken = await resolveSecret("EVOLUTION_WEBHOOK_TOKEN");
  if (expectedToken) {
    const provided = new URL(req.url).searchParams.get("token") ?? "";
    if (provided && timingSafeEqualStrings(provided, expectedToken)) return null;
  }
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

/**
 * Evolution Go has no HMAC: the webhook payload carries the per-instance
 * `instanceToken`. We authenticate by comparing it (constant-time) to the
 * Vault token via EvolutionGoProvider.verifyWebhookSignature. Fail-closed:
 * unknown account or missing/mismatched token → 401.
 */
async function evolutionGoGate(
  rawBody: string,
  payload: unknown,
  account: IAccountRecord | null,
  log: Logger,
  resolveSecret: VaultSecretResolver,
): Promise<Response | null> {
  if (!account) {
    log.warn("evolution-go webhook: conta não encontrada para o instanceId");
    return json({ error: "unknown instance" }, 401);
  }
  const token = (payload as { instanceToken?: string } | null)?.instanceToken ?? "";
  const config = account.providerConfig as { baseUrl?: string; instanceId?: string } | null;
  const provider = new EvolutionGoProvider(
    {
      accountId: account.id,
      baseUrl: String(config?.baseUrl ?? ""),
      instanceId: String(config?.instanceId ?? ""),
      credentialsRef: account.credentialsRef ?? "",
    },
    { resolveSecret },
  );
  const ok = await provider.verifyWebhookSignature(rawBody, token);
  if (!ok) {
    log.warn("evolution-go webhook: instanceToken inválido");
    return json({ error: "invalid token" }, 401);
  }
  return null;
}

// ===== Background avatar fetch ==============================================

/**
 * Keeps best-effort work alive past the 200 response. Supabase Edge exposes
 * `EdgeRuntime.waitUntil`; locally (no runtime) the promise just runs detached.
 * Either way the webhook has already answered — this never blocks it.
 */
function runInBackground(promise: Promise<unknown>): void {
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } })
    .EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(promise);
  else void promise;
}

/**
 * Fire-and-forget profile-photo fetch for a brand-new auto-created contact.
 * Evolution-only (Meta has no equivalent here); silently no-ops when the
 * account isn't configured or the photo can't be resolved.
 */
function scheduleAvatarFetch(
  admin: SupabaseClient,
  deps: IEngineDeps,
  log: Logger,
  traceId: string,
  input: { customerId: string; phone: string; account: IAccountRecord },
): void {
  const { account } = input;
  // evolution-go avatar fetch is deferred to Phase 3 (no Go avatar fn yet).
  if (account.provider !== "evolution") return;
  const config = account.providerConfig as { baseUrl?: string; instanceName?: string } | null;
  const baseUrl = config?.baseUrl;
  const instanceName = config?.instanceName;
  if (!baseUrl || !instanceName) return;
  runInBackground(
    (async () => {
      try {
        const apiKey = await deps.resolveSecret(`${account.credentialsRef}_API_KEY`);
        if (!apiKey) return;
        await syncContactAvatar(
          admin,
          deps,
          { baseUrl, instanceName },
          apiKey,
          { id: input.customerId, phone: input.phone, storeId: account.storeId },
          { traceId, warn: (msg, fields) => log.warn(msg, fields) },
        );
      } catch (err) {
        log.warn("auto avatar fetch failed", {
          customerId: input.customerId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })(),
  );
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

  if (provider !== "meta" && provider !== "evolution" && provider !== "evolution-go") {
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

  // Pre-resolved Go server base_url map (accountId → baseUrl). Populated in the
  // evolution-go gate block below so the synchronous buildProvider callback can
  // enrich providerConfig.baseUrl without an async lookup inside the call.
  // Registry-based Go accounts store base_url on whatsapp_go_servers, NOT in
  // provider_config. Old accounts that still carry it in provider_config are
  // detected in buildProvider and skip the map lookup.
  const goBaseUrls = new Map<string, string>();

  // Auth gates (fail closed) — the ONLY paths that answer 4xx on POST.
  if (provider === "meta") {
    const rejection = await metaGate(req, rawBody, log, resolveSecret);
    if (rejection) return respond(rejection);
  } else if (provider === "evolution-go") {
    // Any-status lookup: the gate is about AUTH (instanceToken), and
    // connection.update events must also reach disconnected accounts.
    const instanceId = (payload as { instanceId?: string } | null)?.instanceId ?? "";
    const account = await db.findEvolutionGoAccountAnyStatus(instanceId);
    const rejection = await evolutionGoGate(rawBody, payload, account, log, resolveSecret);
    if (rejection) return respond(rejection);
    // Pre-resolve the Go server base_url for this account (needed by buildProvider
    // for inbound media download). The account is known here; doing it before
    // processWebhookEvent keeps buildProvider synchronous.
    if (account) {
      const { data: acctRow } = await admin
        .from("whatsapp_accounts")
        .select("go_server_id")
        .eq("id", account.id)
        .maybeSingle();
      if (acctRow?.go_server_id) {
        const { data: server } = await admin
          .from("whatsapp_go_servers")
          .select("base_url")
          .eq("id", acctRow.go_server_id as string)
          .maybeSingle();
        if (server?.base_url) {
          goBaseUrls.set(account.id, String(server.base_url).replace(/\/+$/, ""));
        }
      }
    }
  } else {
    // Any-status lookup: the gate is about AUTH (per-account secret), and
    // connection.update events must also reach disconnected accounts.
    const instance = (payload as { instance?: string } | null)?.instance ?? "";
    const account = await db.findEvolutionAccountAnyStatus(instance);
    const rejection = await evolutionGate(req, rawBody, account, log, resolveSecret);
    if (rejection) return respond(rejection);
  }

  // From here on: always 200 (RF-090) — Meta must never retry-storm us.
  const deps = makeEngineDeps(admin, traceId);
  try {
    const result = await processWebhookEvent({
      provider,
      rawPayload: payload,
      db,
      buildProvider: (account) => {
        // Inject base_url from the server registry when the account is evolution-go
        // and providerConfig does not already have it (old accounts may still carry it).
        let providerConfig = account.providerConfig;
        if (account.provider === "evolution-go" && !providerConfig?.baseUrl) {
          const serverBaseUrl = goBaseUrls.get(account.id);
          if (serverBaseUrl) providerConfig = { ...providerConfig, baseUrl: serverBaseUrl };
        }
        return buildWhatsAppEngine({
          engine: account.provider,
          accountId: account.id,
          providerConfig,
          credentialsRef: account.credentialsRef,
          deps,
        });
      },
      // Background, best-effort: pull the photo of a freshly auto-created
      // contact. Never awaited — the webhook still answers 200 immediately.
      onCustomerAutoCreated: (created) =>
        scheduleAvatarFetch(admin, deps, log, traceId, created),
      // Phase 2 spike (Etapa A): persist raw Evolution Go HistorySync — and any
      // other not-yet-ingested Go event — to integration_logs so the ingestion
      // (Etapa B) can be designed against the real payload shape. The core wraps
      // this in try/catch, so a logging failure never breaks the webhook.
      captureRawEvent: async ({ kind, instanceId, payload }) => {
        await deps.logIntegration({
          integrationName: "whatsapp_evolution_go",
          direction: "inbound",
          endpoint: `/whatsapp-webhook/evolution-go#${kind}`,
          httpStatus: 200,
          latencyMs: 0,
          traceId,
          requestPayload: payload,
          responsePayload: { instanceId, captured: kind },
        });
      },
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
