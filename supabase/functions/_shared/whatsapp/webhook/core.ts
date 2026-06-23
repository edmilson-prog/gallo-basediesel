// AUTO-GENERATED MIRROR — DO NOT EDIT.
// Source: src/providers/whatsapp/webhook/core.ts (sync: bun run scripts/sync-whatsapp-shared.ts)

/**
 * Webhook processing core (PRD-114).
 *
 * Everything that happens AFTER the HTTP gates (routing, signature/allowlist)
 * lives here: idempotency, defensive parsing, account → customer →
 * conversation resolution, message persistence, outbound status updates,
 * synchronous media download with timeout, audit. The database surface is
 * injected ({@link IWebhookDb}) so this module is fully unit-testable; the
 * Edge Function wires a service_role Supabase adapter to it.
 *
 * Runtime-agnostic file: relative imports only, Web APIs only.
 */

import { parseEvolutionInbound } from "../evolution/parser.ts";
import { parseMetaInbound } from "../meta/parser.ts";
import type { IWhatsAppProvider } from "../IWhatsAppProvider.ts";
import type { IInboundMessage, IInboundStatus, IOutboundEcho } from "../types.ts";

export interface IAccountRecord {
  id: string;
  storeId: string;
  provider: "meta" | "evolution";
  phoneNumber: string;
  credentialsRef: string;
  providerConfig: Record<string, unknown> | null;
}

export interface ICustomerRecord {
  id: string;
  sellerId: string;
}

/** Injected persistence surface — the Edge Function backs it with service_role. */
export interface IWebhookDb {
  isProcessed(eventKey: string): Promise<boolean>;
  markProcessed(eventKey: string, traceId: string): Promise<void>;
  /** meta: by provider_config.phoneNumberId, falling back to phone digits. */
  findMetaAccount(
    phoneNumberId: string,
    accountPhoneDigits: string,
  ): Promise<IAccountRecord | null>;
  /** evolution: by provider_config.instanceName. */
  findEvolutionAccount(instanceName: string): Promise<IAccountRecord | null>;
  /**
   * Like findEvolutionAccount but INCLUDING disconnected rows — connection
   * lifecycle events must reach accounts the message pipeline ignores
   * (a reconnect done straight on the Evolution server flips them back).
   */
  findEvolutionAccountAnyStatus(instanceName: string): Promise<IAccountRecord | null>;
  /** Conditional status write; returns true when the row actually changed. */
  setAccountConnectionStatus(
    accountId: string,
    status: "connected" | "disconnected",
  ): Promise<boolean>;
  findCustomerByPhone(storeId: string, phoneDigits: string): Promise<ICustomerRecord | null>;
  /** Store default owner for auto-created customers (manager → fallback staff). */
  resolveDefaultSellerId(storeId: string): Promise<string>;
  createPendingCustomer(input: {
    storeId: string;
    phone: string;
    sellerId: string;
    /** Contact's WhatsApp profile name; seeds full_name (falls back to the phone
     *  when absent) AND whatsapp_name when present. */
    name?: string;
  }): Promise<ICustomerRecord>;
  /**
   * Best-effort, called on every inbound message carrying a pushName:
   *  1. ALWAYS records `name` in whatsapp_name (the live WhatsApp profile name),
   *     even when the display name was renamed by hand.
   *  2. Heals the display name (full_name / nome_fantasia) to `name` ONLY when it
   *     is still the phone-number placeholder (or empty) — a manually-set name is
   *     never overwritten.
   */
  applyInboundContactName(customerId: string, name: string): Promise<void>;
  findOpenConversation(customerId: string, accountId: string): Promise<{ id: string } | null>;
  createConversation(input: {
    storeId: string;
    customerId: string;
    accountId: string;
    assignedSellerId: string | null;
    lastMessageAt: string;
    /** aguardando = inbound awaiting staff; em_andamento = we initiated (echo). */
    status: "aguardando" | "em_andamento";
  }): Promise<{ id: string }>;
  insertInboundMessage(input: {
    conversationId: string;
    customerId: string;
    provider: "meta" | "evolution";
    text: string;
    mediaType: string | null;
    providerMessageId: string;
    eventKey: string;
    sentAt: string;
  }): Promise<{ id: string }>;
  bumpConversation(conversationId: string, lastMessageAt: string): Promise<void>;
  /** Mirrored phone-sent message (outbound echo) — direction out, status sent. */
  insertOutboundEchoMessage(input: {
    conversationId: string;
    provider: "meta" | "evolution";
    text: string;
    mediaType: string | null;
    providerMessageId: string;
    eventKey: string;
    sentAt: string;
  }): Promise<{ id: string }>;
  /** last_message_at bump WITHOUT unread increment (echo path). */
  touchConversation(conversationId: string, lastMessageAt: string): Promise<void>;
  /** Outbound message lookup with enough context to flag the customer (PRD-118). */
  findOutboundMessageByProviderMessageId(providerMessageId: string): Promise<{
    id: string;
    conversationId: string;
    customerId: string | null;
    storeId: string | null;
  } | null>;
  applyStatusToMessage(input: {
    messageId: string;
    status: "sent" | "delivered" | "read" | "failed";
    eventKey: string;
    timestamp: string;
    failureReason?: string;
    failureCode?: string;
  }): Promise<void>;
  /** PRD-118 RF-050: customers.whatsapp_status = 'invalid' (Meta 131026). */
  markCustomerWhatsappInvalid(customerId: string): Promise<void>;
  setMessageMedia(
    messageId: string,
    mediaUrl: string | null,
    downloadStatus: "ok" | "failed",
  ): Promise<void>;
  uploadMedia(path: string, data: Uint8Array, mimeType: string): Promise<void>;
  audit(input: {
    storeId: string;
    action: string;
    resource: string;
    resourceId: string;
    after: Record<string, unknown>;
  }): Promise<void>;
}

export type WebhookOutcome =
  | "duplicate"
  | "message-created"
  | "echo-created"
  | "status-applied"
  | "status-unmatched"
  | "account-not-found"
  | "connection-synced"
  | "ignored";

export interface IProcessResult {
  outcome: WebhookOutcome;
  detail?: string;
  messageId?: string;
  conversationId?: string;
}

export interface IProcessArgs {
  provider: "meta" | "evolution";
  rawPayload: unknown;
  db: IWebhookDb;
  /** Builds the concrete engine for the resolved account (media download). */
  buildProvider: (account: IAccountRecord) => IWhatsAppProvider;
  traceId: string;
  warn?: (msg: string, fields?: Record<string, unknown>) => void;
  /** PRD-114 RNF-006: media must land within this budget or be marked failed. */
  mediaTimeoutMs?: number;
  /**
   * Fire-and-forget hook invoked when an inbound message auto-creates a
   * brand-new contact. The Edge wiring uses it to pull the contact's WhatsApp
   * profile photo in the background (best-effort). It MUST NOT block or throw:
   * the webhook stays fail-closed and answers 200 fast regardless.
   */
  onCustomerAutoCreated?: (input: {
    customerId: string;
    phone: string;
    account: IAccountRecord;
  }) => void;
}

const DEFAULT_MEDIA_TIMEOUT_MS = 15_000;

const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "video/mp4": "mp4",
  "application/pdf": "pdf",
};

function digits(phone: string): string {
  return phone.replace(/\D/g, "");
}

/** A usable contact name has at least one letter (rejects empty / phone-like). */
function looksLikeName(value: string | undefined): value is string {
  return value !== undefined && /\p{L}/u.test(value);
}

/** Normalized inbound contentType → messages.media_type column value. */
function toMediaType(contentType: string): string | null {
  return ["image", "audio", "video", "document"].includes(contentType) ? contentType : null;
}

function extractMetaPhoneNumberId(rawPayload: unknown): string {
  const payload = rawPayload as {
    entry?: Array<{ changes?: Array<{ value?: { metadata?: { phone_number_id?: string } } }> }>;
  } | null;
  return payload?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id ?? "";
}

function extractEvolutionInstance(rawPayload: unknown): string {
  return (rawPayload as { instance?: string } | null)?.instance ?? "";
}

/**
 * Detects an Evolution `connection.update` lifecycle event (the subscription
 * uses CONNECTION_UPDATE; payloads arrive dot-lowercase — both accepted).
 * State key varies across builds: data.state (v2) / data.connection (Baileys).
 */
function extractEvolutionConnectionUpdate(
  rawPayload: unknown,
): { instance: string; state: "open" | "connecting" | "close" } | null {
  const payload = rawPayload as {
    event?: string;
    instance?: string;
    data?: { state?: string; connection?: string; status?: string };
  } | null;
  const event = String(payload?.event ?? "")
    .toLowerCase()
    .replace(/_/g, ".");
  if (event !== "connection.update") return null;
  const raw = payload?.data?.state ?? payload?.data?.connection ?? payload?.data?.status;
  if (raw !== "open" && raw !== "connecting" && raw !== "close") return null;
  return { instance: payload?.instance ?? "", state: raw };
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function processWebhookEvent(args: IProcessArgs): Promise<IProcessResult> {
  const { provider, rawPayload, db, traceId } = args;
  const warn = args.warn ?? (() => {});

  // 0. Evolution connection lifecycle (CONNECTION_UPDATE subscription): keep
  //    whatsapp_accounts.status truthful when the session opens/closes OUTSIDE
  //    the app (phone unlinked, logout on the Evolution server…). Conditional
  //    write makes redeliveries idempotent; `connecting` is transient → ignored.
  if (provider === "evolution") {
    const connection = extractEvolutionConnectionUpdate(rawPayload);
    if (connection) {
      if (connection.state === "connecting") {
        return { outcome: "ignored", detail: "connection.update: connecting (transient)" };
      }
      const account = await db.findEvolutionAccountAnyStatus(connection.instance);
      if (!account) {
        warn("connection.update for unknown instance", { instance: connection.instance });
        return { outcome: "account-not-found" };
      }
      const status = connection.state === "open" ? "connected" : "disconnected";
      const changed = await db.setAccountConnectionStatus(account.id, status);
      if (changed) {
        await db.audit({
          storeId: account.storeId,
          action:
            status === "connected"
              ? "whatsapp_instance_connected"
              : "whatsapp_instance_disconnected",
          resource: "whatsapp_account",
          resourceId: account.id,
          after: { state: connection.state, reason: "connection_update", traceId },
        });
      }
      return { outcome: "connection-synced", detail: `${connection.instance}:${connection.state}` };
    }
  }

  // 1. Defensive parse FIRST (pure, cheap). Unparseable payloads — including
  //    Evolution group/broadcast/lid events and non-message events — are
  //    ignorable by design (RNF-007): the webhook answers 200 and moves on.
  let parsed: IInboundMessage | IInboundStatus | IOutboundEcho;
  try {
    parsed =
      provider === "meta"
        ? parseMetaInbound(rawPayload, "")
        : parseEvolutionInbound(rawPayload, "");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    warn("webhook payload ignored", { provider, detail });
    return { outcome: "ignored", detail };
  }

  // A missing provider id would collapse distinct events into the same
  // eventKey ("whatsapp:<provider>:") — refuse early.
  if (!parsed.providerMessageId) {
    return { outcome: "ignored", detail: "missing provider message id" };
  }

  // 2. Idempotency (RF-020..022). Status events get a per-status key: the
  //    SAME provider message id flows through upsert (echo) AND every ack
  //    (sent/delivered/read/failed) — a shared key would let whichever event
  //    lands first swallow all the others.
  const eventKey =
    parsed.type === "status"
      ? `whatsapp:${provider}:${parsed.providerMessageId}:${parsed.status}`
      : `whatsapp:${provider}:${parsed.providerMessageId}`;
  if (await db.isProcessed(eventKey)) {
    return { outcome: "duplicate", detail: eventKey };
  }

  // 3. Status updates (RF-060/061) — no account resolution needed: the
  //    provider_message_id of the outbound message is globally unique.
  if (parsed.type === "status") {
    const outbound = await db.findOutboundMessageByProviderMessageId(parsed.providerMessageId);
    if (!outbound) {
      warn("status for unknown outbound message", {
        providerMessageId: parsed.providerMessageId,
      });
      await db.markProcessed(eventKey, traceId);
      return { outcome: "status-unmatched", detail: parsed.providerMessageId };
    }
    await db.applyStatusToMessage({
      messageId: outbound.id,
      status: parsed.status,
      eventKey,
      timestamp: parsed.timestamp,
      failureReason: parsed.failureReason,
      failureCode: parsed.failureCode,
    });
    await db.markProcessed(eventKey, traceId);

    // PRD-118 RF-050: Meta 131026 = the destination number is not on WhatsApp.
    // Flag the customer so future sends ask for explicit confirmation. Going
    // back to 'valid' is a manual staff action — never automatic (RF-052).
    // Best-effort: a flag failure must not turn the status event into a retry.
    if (parsed.status === "failed" && parsed.failureCode === "131026" && outbound.customerId) {
      try {
        await db.markCustomerWhatsappInvalid(outbound.customerId);
        if (outbound.storeId) {
          await db.audit({
            storeId: outbound.storeId,
            action: "customer_whatsapp_marked_invalid",
            resource: "customer",
            resourceId: outbound.customerId,
            after: {
              reason: parsed.failureReason ?? "Meta 131026",
              failureCode: parsed.failureCode,
              messageId: outbound.id,
              traceId,
            },
          });
        }
      } catch (error) {
        warn("failed to flag invalid whatsapp customer", {
          customerId: outbound.customerId,
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return { outcome: "status-applied", messageId: outbound.id };
  }

  // 3.5. Outbound echoes (Evolution fromMe — real-inbox spec 2026-06-11):
  //      mirror what the team sends FROM THE PHONE. App-sent messages echo
  //      too — the provider_message_id lookup below dedups them.
  if (parsed.type === "outbound-echo") {
    const existing = await db.findOutboundMessageByProviderMessageId(parsed.providerMessageId);
    if (existing) {
      await db.markProcessed(eventKey, traceId);
      return { outcome: "duplicate", detail: "app-send echo" };
    }
    const account = await db.findEvolutionAccount(extractEvolutionInstance(rawPayload));
    if (!account) {
      warn("echo for unknown account", { provider });
      return { outcome: "account-not-found" };
    }
    const toDigits = digits(parsed.toPhone);
    let customer = await db.findCustomerByPhone(account.storeId, toDigits);
    let customerCreated = false;
    if (!customer) {
      const sellerId = await db.resolveDefaultSellerId(account.storeId);
      customer = await db.createPendingCustomer({
        storeId: account.storeId,
        phone: parsed.toPhone,
        sellerId,
      });
      customerCreated = true;
      // Same background photo fetch when WE start the chat from the phone.
      args.onCustomerAutoCreated?.({
        customerId: customer.id,
        phone: parsed.toPhone,
        account,
      });
    }
    let conversation = await db.findOpenConversation(customer.id, account.id);
    if (!conversation) {
      conversation = await db.createConversation({
        storeId: account.storeId,
        customerId: customer.id,
        accountId: account.id,
        // UNASSIGNED (pool): the webhook cannot know which seller sent from the
        // phone, so it never pins the chat to the customer's wallet owner.
        // Visibility comes from instance access (can_access_conversation).
        assignedSellerId: null,
        lastMessageAt: parsed.timestamp,
        status: "em_andamento",
      });
    }
    const message = await db.insertOutboundEchoMessage({
      conversationId: conversation.id,
      provider,
      text: parsed.text ?? parsed.mediaCaption ?? "",
      mediaType: toMediaType(parsed.contentType),
      providerMessageId: parsed.providerMessageId,
      eventKey,
      sentAt: parsed.timestamp,
    });
    await db.touchConversation(conversation.id, parsed.timestamp);
    await db.markProcessed(eventKey, traceId);
    await db.audit({
      storeId: account.storeId,
      action: "webhook_received",
      resource: "message",
      resourceId: message.id,
      after: {
        provider,
        eventKey,
        direction: "out",
        contentType: parsed.contentType,
        toPhoneMasked: `***${toDigits.slice(-4)}`,
        customerCreated,
        traceId,
      },
    });
    return { outcome: "echo-created", messageId: message.id, conversationId: conversation.id };
  }

  // 4. Account resolution (RF-040.1). Not ours / misconfigured → 200 + warn;
  //    deliberately NOT marked processed, so a later config fix can replay.
  const account =
    provider === "meta"
      ? await db.findMetaAccount(
          extractMetaPhoneNumberId(rawPayload),
          digits(parsed.toAccountPhone),
        )
      : await db.findEvolutionAccount(extractEvolutionInstance(rawPayload));
  if (!account) {
    warn("webhook for unknown account", { provider, toAccountPhone: parsed.toAccountPhone });
    return { outcome: "account-not-found" };
  }

  // 5. Customer resolution (RF-040.2) — auto-created customers go to the
  //    store's default seller (manager) with a pending_review tag. The PRD's
  //    seller_id=null is impossible here: customers.seller_id is NOT NULL by
  //    schema (recorded deviation).
  const fromDigits = digits(parsed.fromPhone);
  const contactName = looksLikeName(parsed.senderName) ? parsed.senderName : undefined;
  let customer = await db.findCustomerByPhone(account.storeId, fromDigits);
  let customerCreated = false;
  if (!customer) {
    const sellerId = await db.resolveDefaultSellerId(account.storeId);
    customer = await db.createPendingCustomer({
      storeId: account.storeId,
      phone: parsed.fromPhone,
      sellerId,
      name: contactName,
    });
    customerCreated = true;
    // Best-effort, fire-and-forget: pull this brand-new contact's WhatsApp
    // profile photo in the background. Never awaited, never throws here.
    args.onCustomerAutoCreated?.({
      customerId: customer.id,
      phone: parsed.fromPhone,
      account,
    });
  } else if (contactName) {
    // Existing contact: always refresh whatsapp_name, and heal the display name
    // if it's still the phone placeholder. Best-effort: must never break the webhook.
    try {
      await db.applyInboundContactName(customer.id, contactName);
    } catch (error) {
      warn("failed to fill customer name", {
        customerId: customer.id,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // 6. Conversation resolution (RF-040.3) — closed (resolvida/arquivada)
  //    conversations are never reused.
  let conversation = await db.findOpenConversation(customer.id, account.id);
  if (!conversation) {
    conversation = await db.createConversation({
      storeId: account.storeId,
      customerId: customer.id,
      accountId: account.id,
      // New inbound conversations land UNASSIGNED (queue), never auto-assigned
      // to the customer's wallet owner — they drop into the pool for whoever
      // operates the instance to pick up. Visibility comes from instance access
      // (the unassigned branch of can_access_conversation); the wallet
      // (customer.seller_id) is untouched.
      assignedSellerId: null,
      lastMessageAt: parsed.timestamp,
      status: "aguardando",
    });
  }

  // 7. Persist message (RF-050) BEFORE any media work — media now or never,
  //    but the message record never depends on the download succeeding.
  const message = await db.insertInboundMessage({
    conversationId: conversation.id,
    customerId: customer.id,
    provider,
    text: parsed.text ?? parsed.mediaCaption ?? "",
    mediaType: toMediaType(parsed.contentType),
    providerMessageId: parsed.providerMessageId,
    eventKey,
    sentAt: parsed.timestamp,
  });
  await db.bumpConversation(conversation.id, parsed.timestamp);

  // Idempotency mark RIGHT AFTER the message lands (RNF-002): a provider
  // retry from here on can never duplicate it. Media/audit below are
  // best-effort and must not reopen the duplication window.
  await db.markProcessed(eventKey, traceId);

  // 8. Synchronous media download (RF-070, RNF-006): Meta's URL expires in
  //    ~5min, so it is now or marked failed for manual retry.
  if (parsed.mediaId) {
    try {
      const engine = args.buildProvider(account);
      const media = await withTimeout(
        engine.downloadInboundMedia(parsed.mediaId),
        args.mediaTimeoutMs ?? DEFAULT_MEDIA_TIMEOUT_MS,
      );
      const extension = MIME_EXTENSIONS[media.mimeType] ?? "bin";
      const path = `conversations/${conversation.id}/${message.id}/media.${extension}`;
      await db.uploadMedia(path, media.data, media.mimeType);
      await db.setMessageMedia(message.id, path, "ok");
    } catch (error) {
      warn("inbound media download failed", {
        mediaId: parsed.mediaId,
        detail: error instanceof Error ? error.message : String(error),
      });
      await db.setMessageMedia(message.id, null, "failed");
    }
  }

  // 9. Audit (RF-080) — phone masked to the last 4 digits (PII minimization).
  await db.audit({
    storeId: account.storeId,
    action: "webhook_received",
    resource: "message",
    resourceId: message.id,
    after: {
      provider,
      eventKey,
      contentType: parsed.contentType,
      hasMedia: Boolean(parsed.mediaId),
      fromPhoneMasked: `***${fromDigits.slice(-4)}`,
      customerCreated,
      traceId,
    },
  });

  return { outcome: "message-created", messageId: message.id, conversationId: conversation.id };
}
