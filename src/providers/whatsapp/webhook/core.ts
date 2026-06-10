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

import { parseEvolutionInbound } from "../evolution/parser";
import { parseMetaInbound } from "../meta/parser";
import type { IWhatsAppProvider } from "../IWhatsAppProvider";
import type { IInboundMessage, IInboundStatus } from "../types";

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
  findCustomerByPhone(storeId: string, phoneDigits: string): Promise<ICustomerRecord | null>;
  /** Store default owner for auto-created customers (manager → fallback staff). */
  resolveDefaultSellerId(storeId: string): Promise<string>;
  createPendingCustomer(input: {
    storeId: string;
    phone: string;
    sellerId: string;
  }): Promise<ICustomerRecord>;
  findOpenConversation(customerId: string, accountId: string): Promise<{ id: string } | null>;
  createConversation(input: {
    storeId: string;
    customerId: string;
    accountId: string;
    assignedSellerId: string | null;
    lastMessageAt: string;
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
  | "status-applied"
  | "status-unmatched"
  | "account-not-found"
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

  // 1. Defensive parse FIRST (pure, cheap). Unparseable payloads — including
  //    Evolution own-message echoes and non-message events — are ignorable by
  //    design (RNF-007): the webhook answers 200 and moves on.
  let parsed: IInboundMessage | IInboundStatus;
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

  // 2. Idempotency (RF-020..022): Meta retries the same event 2-3×.
  const eventKey = `whatsapp:${provider}:${parsed.providerMessageId}`;
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
  let customer = await db.findCustomerByPhone(account.storeId, fromDigits);
  let customerCreated = false;
  if (!customer) {
    const sellerId = await db.resolveDefaultSellerId(account.storeId);
    customer = await db.createPendingCustomer({
      storeId: account.storeId,
      phone: parsed.fromPhone,
      sellerId,
    });
    customerCreated = true;
  }

  // 6. Conversation resolution (RF-040.3) — closed (resolvida/arquivada)
  //    conversations are never reused.
  let conversation = await db.findOpenConversation(customer.id, account.id);
  if (!conversation) {
    conversation = await db.createConversation({
      storeId: account.storeId,
      customerId: customer.id,
      accountId: account.id,
      assignedSellerId: customer.sellerId,
      lastMessageAt: parsed.timestamp,
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
