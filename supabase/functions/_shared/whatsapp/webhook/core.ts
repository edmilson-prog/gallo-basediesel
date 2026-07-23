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
import { parseEvolutionGoInbound } from "../evolution-go/parser.ts";
import { parseMetaInbound } from "../meta/parser.ts";
import { parseOpenWaInbound } from "../openwa/parser.ts";
import type { IWhatsAppProvider } from "../IWhatsAppProvider.ts";
import type { IInboundMessage, IInboundStatus, IOutboundEcho, IAdReferral } from "../types.ts";
import { MEDIA_DISCRIMINATOR_TYPES } from "../types.ts";

export interface IAccountRecord {
  id: string;
  storeId: string;
  provider: "meta" | "evolution" | "evolution-go" | "openwa";
  phoneNumber: string;
  credentialsRef: string;
  providerConfig: Record<string, unknown> | null;
}

export interface ICustomerRecord {
  id: string;
}

export interface ILeadRecord {
  id: string;
  sellerId: string;
  /** `null` when the lead is active/converted; a loss reason when marked lost. */
  lossReason: string | null;
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
  /** Resolve a connected evolution-go account by the whatsmeow payload instanceId (provider_config.instanceId). */
  findEvolutionGoAccount(instanceId: string): Promise<IAccountRecord | null>;
  /** Like findEvolutionGoAccount but INCLUDING disconnected rows (used by the edge auth gate). */
  findEvolutionGoAccountAnyStatus(instanceId: string): Promise<IAccountRecord | null>;
  /** openwa: by provider_config.sessionId (webhook envelope carries it as `sessionId`). */
  findOpenWaAccount(sessionId: string): Promise<IAccountRecord | null>;
  /** Conditional status write; returns true when the row actually changed. */
  setAccountConnectionStatus(
    accountId: string,
    status: "connected" | "disconnected",
  ): Promise<boolean>;
  findCustomerByPhone(storeId: string, phoneDigits: string): Promise<ICustomerRecord | null>;
  /** Looks up an existing lead for this store+phone — open or lost (the caller
   *  decides whether to reopen it via `reopenLostLead`). */
  findLeadByPhone(storeId: string, phoneDigits: string): Promise<ILeadRecord | null>;
  /**
   * Clears lossReason/lossNotes and resets the lead to the store's first
   * pipeline stage (by `order`) — reopens a previously lost lead so a repeat
   * inbound from the same number doesn't spawn a duplicate.
   */
  reopenLostLead(leadId: string): Promise<void>;
  /**
   * Creates a lead for a brand-new WhatsApp contact: origin='whatsapp', the
   * store's first pipeline stage, temperature='morno', seller resolved via
   * the rotation-assignment SQL function.
   */
  createLead(input: { storeId: string; phone: string; name?: string }): Promise<ILeadRecord>;
  /** Same contract as findOpenConversation but keyed by leadId instead of customerId. */
  findOpenConversationForLead(
    leadId: string,
    accountId: string,
    includeTerminal?: boolean,
  ): Promise<{ id: string; status: string } | null>;
  /** Idempotently appends conversationId to lead.conversations. */
  linkConversationToLead(leadId: string, conversationId: string): Promise<void>;
  /**
   * Best-effort, called on every inbound message carrying a pushName:
   *  1. ALWAYS records `name` in whatsapp_name (the live WhatsApp profile name),
   *     even when the display name was renamed by hand.
   *  2. Heals the display name (full_name / nome_fantasia) to `name` ONLY when it
   *     is still the phone-number placeholder (or empty) — a manually-set name is
   *     never overwritten.
   */
  applyInboundContactName(customerId: string, name: string): Promise<void>;
  /**
   * Looks up the latest conversation for this customer+account. By default
   * (`includeTerminal` omitted/false) it's OPEN-ONLY — excludes resolvida/
   * arquivada — used by the outbound echo path, which must NEVER reopen a
   * closed conversation (spec 2026-07-03 §1.5: echo spawns a fresh one
   * instead). Customer-inbound (step 6) passes `includeTerminal: true` to
   * also see closed conversations so it can reopen them via
   * reopenConversation.
   */
  findOpenConversation(
    customerId: string,
    accountId: string,
    includeTerminal?: boolean,
  ): Promise<{ id: string; status: string; isSdrActive: boolean } | null>;
  createConversation(input: {
    storeId: string;
    /** Exactly one of customerId/leadId is set — mirrors the app-level invariant. */
    customerId?: string | null;
    leadId?: string | null;
    accountId: string;
    assignedSellerId: string | null;
    lastMessageAt: string;
    /** New conversations always land queued: inbound awaits staff, and an echo
     *  has no known author — someone claims it in the app (spec 2026-07-02). */
    status: "aguardando";
  }): Promise<{ id: string }>;
  insertInboundMessage(input: {
    conversationId: string;
    /** Feeds messages.author_id (free text, no FK) — customer OR lead id. */
    authorId: string;
    provider: "meta" | "evolution" | "evolution-go" | "openwa";
    text: string;
    mediaType: string | null;
    /** Original document filename (messages.media_filename). */
    mediaFilename?: string | null;
    providerMessageId: string;
    eventKey: string;
    sentAt: string;
  }): Promise<{ id: string }>;
  bumpConversation(conversationId: string, lastMessageAt: string): Promise<void>;
  /** Best-effort attribution write (ad-source detection, PRD n/a) — sets/
   *  overwrites conversations.ad_referral with the LATEST inbound referral
   *  seen. Only ever called when parsed.adReferral is present. */
  setConversationAdReferral(conversationId: string, adReferral: IAdReferral): Promise<void>;
  /**
   * Reopens a closed (resolvida/arquivada) conversation on customer inbound
   * (spec 2026-07-03 §1.5): status→'aguardando', unassigns the owner, bumps
   * last_message_at + unread_count. Folds the bumpConversation effect in —
   * callers must NOT also call bumpConversation for the same event.
   */
  reopenConversation(conversationId: string, lastMessageAt: string): Promise<void>;
  /** Mirrored phone-sent message (outbound echo) — direction out, status sent. */
  insertOutboundEchoMessage(input: {
    conversationId: string;
    provider: "meta" | "evolution" | "evolution-go" | "openwa";
    text: string;
    mediaType: string | null;
    mediaFilename?: string | null;
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
  provider: "meta" | "evolution" | "evolution-go" | "openwa";
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
  /**
   * Fire-and-forget hook invoked when an inbound message lands on a
   * conversation the SDR is already driving (`is_sdr_active=true`). The Edge
   * wiring calls sdr-respond in the background to continue the turn. MUST
   * NOT block or throw — the webhook stays fail-closed and answers 200 fast
   * regardless (SDR Parte B, 2026-07-15).
   */
  onSdrTurn?: (input: { conversationId: string }) => void;
  /**
   * Optional sink for raw Evolution Go events we don't yet ingest but want to
   * inspect — the HistorySync ingestion spike (Phase 2, Etapa A). Best-effort:
   * a failure here must never break the fail-closed webhook. The Edge wires it
   * to integration_logs; unit tests pass a spy.
   */
  captureRawEvent?: (input: {
    kind: string;
    instanceId: string;
    payload: unknown;
  }) => Promise<void>;
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

// Local terminal-axis predicate (runtime-agnostic file: no cross-import from
// providers/data/engine — see assignmentStatusCoupling.ts for the mock/
// Supabase-side twin of this rule).
const TERMINAL_STATUSES = new Set(["resolvida", "arquivada"]);
function reopenOnInbound(current: string): "aguardando" | null {
  return TERMINAL_STATUSES.has(current) ? "aguardando" : null;
}

function digits(phone: string): string {
  return phone.replace(/\D/g, "");
}

/** A usable contact name has at least one letter (rejects empty / phone-like). */
function looksLikeName(value: string | undefined): value is string {
  return value !== undefined && /\p{L}/u.test(value);
}

/** Normalized inbound contentType → messages.media_type column value. */
function toMediaType(contentType: string): string | null {
  // location/contact carry no binary (no mediaId → media download never runs),
  // but the column still discriminates them so the UI renders the right bubble;
  // the structured payload rides in `text` (see ../contentFormat). The membership
  // set is shared (MEDIA_DISCRIMINATOR_TYPES) with the history importers.
  return (MEDIA_DISCRIMINATOR_TYPES as readonly string[]).includes(contentType)
    ? contentType
    : null;
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

function extractEvolutionGoInstance(rawPayload: unknown): string {
  return String((rawPayload as { instanceId?: string } | null)?.instanceId ?? "");
}

/**
 * openwa's webhook envelope carries the session id as `sessionId` (confirmed
 * live 2026-07-07 — matches `provider_config.sessionId`, the id `POST
 * /api/sessions` returns). Falls back to the nested message record's own
 * `sessionId` (the record carries it too — confirmed via GET /messages), so
 * an envelope drift or a bare-record delivery still resolves the account.
 * No connection-lifecycle handling is implemented for openwa v1 (the
 * `session.status`/`session.qr` events are dropped by the parser as
 * unsupported — see ../openwa/parser); only message/ack events resolve an
 * account, via findOpenWaAccount below.
 */
function extractOpenWaInstance(rawPayload: unknown): string {
  const payload = rawPayload as
    | { sessionId?: string; data?: { sessionId?: string } | null }
    | null;
  return payload?.sessionId ?? payload?.data?.sessionId ?? "";
}

/**
 * Maps an Evolution Go lifecycle event to a connection status, or null when it
 * carries no status signal. whatsmeow emits `LoggedOut` when the device is
 * unlinked (Reason 401) and `Connection` (State open/close) on session changes.
 * The webhook is the authoritative status signal — the active /instance/status
 * poll is unreliable (it 400s on this build and only runs while the app's
 * WhatsApp page is open). `connecting` is transient → no status.
 */
function goConnectionTransition(
  event: string,
  state: string | undefined,
): "connected" | "disconnected" | null {
  if (event === "LoggedOut") return "disconnected";
  if (event === "Connection") {
    const s = String(state ?? "").toLowerCase();
    if (s === "open" || s === "connected") return "connected";
    if (s === "close" || s === "closed" || s === "disconnected" || s === "loggedout") {
      return "disconnected";
    }
  }
  return null;
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

interface IResolvedContact {
  kind: "customer" | "lead";
  id: string;
  /** Only set for kind==='lead' — the customer path stays unassigned (pool), unchanged. */
  sellerId: string | null;
  /** True only when this call just created a brand-new lead — NOT when an
   *  existing lead was found/reopened (that's a reuse, not a creation). */
  created: boolean;
}

/**
 * Resolves who a phone number is, in this order: a real customer (unchanged
 * behavior) → an existing lead (reopened if it was marked lost) → a brand-new
 * lead. Shared by the inbound-customer-message and outbound-echo paths so
 * neither one still creates a pending_review customer placeholder.
 */
async function resolveContact(
  db: IWebhookDb,
  storeId: string,
  phone: string,
  name: string | undefined,
): Promise<IResolvedContact> {
  const phoneDigits = digits(phone);
  const customer = await db.findCustomerByPhone(storeId, phoneDigits);
  if (customer) {
    return { kind: "customer", id: customer.id, sellerId: null, created: false };
  }
  const lead = await db.findLeadByPhone(storeId, phoneDigits);
  if (lead) {
    if (lead.lossReason !== null) {
      await db.reopenLostLead(lead.id);
    }
    return { kind: "lead", id: lead.id, sellerId: lead.sellerId, created: false };
  }
  const created = await db.createLead({ storeId, phone, name });
  return { kind: "lead", id: created.id, sellerId: created.sellerId, created: true };
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

  // Evolution Go connection lifecycle (whatsmeow `Connection` event, PascalCase
  // with data.State). No message to persist; account status sync is handled by
  // the whatsapp-connect poll, not the webhook. Return early before the parser,
  // which throws on non-Message events.
  if (provider === "evolution-go") {
    const ev = rawPayload as { event?: string; data?: { State?: string } } | null;
    const goEvent = ev?.event ?? "";

    // Connection lifecycle → keep whatsapp_accounts.status truthful. whatsmeow
    // pushes `LoggedOut` when the device is unlinked and `Connection` (open/close)
    // on session changes; this webhook is the authoritative signal (the active
    // /instance/status poll 400s on this build). Conditional write + audit-on-
    // change keeps redeliveries idempotent. Mirrors the classic Evolution path.
    const goStatus = goConnectionTransition(goEvent, ev?.data?.State);
    if (goStatus) {
      const instanceId = extractEvolutionGoInstance(rawPayload);
      const account = await db.findEvolutionGoAccountAnyStatus(instanceId);
      if (!account) {
        warn("evolution-go connection event for unknown instance", { instanceId, goEvent });
        return { outcome: "account-not-found" };
      }
      const changed = await db.setAccountConnectionStatus(account.id, goStatus);
      if (changed) {
        await db.audit({
          storeId: account.storeId,
          action:
            goStatus === "connected"
              ? "whatsapp_instance_connected"
              : "whatsapp_instance_disconnected",
          resource: "whatsapp_account",
          resourceId: account.id,
          after: {
            event: goEvent,
            state: ev?.data?.State ?? null,
            reason: "evolution_go_webhook",
            traceId,
          },
        });
      }
      return { outcome: "connection-synced", detail: `${goEvent}:${goStatus}` };
    }

    // Transient `Connection` (connecting) carries no status — ignore quietly.
    if (goEvent === "Connection") {
      return { outcome: "ignored", detail: `Connection: ${ev?.data?.State ?? ""}` };
    }

    // Phase 2 spike (Etapa A): HistorySync — and any other not-yet-ingested Go
    // event — is captured RAW so the ingestion can be designed against the real
    // payload shape, then acknowledged. Message/Receipt fall through to the
    // parser below (unchanged). Capture is best-effort: a logging failure must
    // not turn the event into a 500/retry.
    if (goEvent && goEvent !== "Message" && goEvent !== "Receipt" && goEvent !== "SendMessage") {
      try {
        await args.captureRawEvent?.({
          kind: goEvent,
          instanceId: extractEvolutionGoInstance(rawPayload),
          payload: rawPayload,
        });
      } catch (error) {
        warn("failed to capture raw evolution-go event", {
          event: goEvent,
          detail: error instanceof Error ? error.message : String(error),
        });
      }
      return { outcome: "ignored", detail: `captured: ${goEvent}` };
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
        : provider === "evolution-go"
          ? parseEvolutionGoInbound(rawPayload, "")
          : provider === "openwa"
            ? parseOpenWaInbound(rawPayload, "")
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
  //    The key is ALSO scoped by instance (2026-07-07): when two platform
  //    numbers talk to each other, the SAME WhatsApp message id reaches us
  //    twice — sender echo + receiver inbound, distinct sessions/accounts. An
  //    unscoped key let whichever side landed first swallow the other (media
  //    echoes always lost that race, so phone-sent media never mirrored).
  const instanceScope =
    provider === "meta"
      ? extractMetaPhoneNumberId(rawPayload)
      : provider === "evolution-go"
        ? extractEvolutionGoInstance(rawPayload)
        : provider === "openwa"
          ? extractOpenWaInstance(rawPayload)
          : extractEvolutionInstance(rawPayload);
  const eventKey =
    parsed.type === "status"
      ? `whatsapp:${provider}:${instanceScope}:${parsed.providerMessageId}:${parsed.status}`
      : `whatsapp:${provider}:${instanceScope}:${parsed.providerMessageId}`;
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
    const account =
      provider === "evolution-go"
        ? await db.findEvolutionGoAccount(extractEvolutionGoInstance(rawPayload))
        : provider === "openwa"
          ? await db.findOpenWaAccount(extractOpenWaInstance(rawPayload))
          : await db.findEvolutionAccount(extractEvolutionInstance(rawPayload));
    if (!account) {
      warn("echo for unknown account", { provider });
      return { outcome: "account-not-found" };
    }
    const toDigits = digits(parsed.toPhone);
    const resolved = await resolveContact(db, account.storeId, parsed.toPhone, undefined);
    // OPEN-ONLY lookup (includeTerminal omitted): the echo is business-sent,
    // never reopens a closed conversation — spawns a fresh one instead
    // (spec 2026-07-03 §1.5). NOTE: the WAHA pipeline additionally applies
    // the echo-continuity window (appends to a recently-`resolvida` thread —
    // docs/dev/conversation-split-echo-after-close.md §7 item 3). This legacy
    // pipeline (Meta/Evolution/Go/OpenWA) keeps always-create ON PURPOSE
    // while it carries no live traffic — port the window here if these
    // providers return.
    let conversation: { id: string } | null =
      resolved.kind === "customer"
        ? await db.findOpenConversation(resolved.id, account.id)
        : await db.findOpenConversationForLead(resolved.id, account.id);
    if (!conversation) {
      const created = await db.createConversation({
        storeId: account.storeId,
        customerId: resolved.kind === "customer" ? resolved.id : null,
        leadId: resolved.kind === "lead" ? resolved.id : null,
        accountId: account.id,
        // Customer path: UNASSIGNED (pool) — the webhook cannot know which
        // seller sent from the phone, so it never pins the chat; it lands
        // QUEUED ('aguardando') for someone to claim in the app (spec
        // 2026-07-02). Lead path: assigns the lead's own seller immediately,
        // keeping Atendimento and Carteira consistent (same as inbound).
        assignedSellerId: resolved.kind === "lead" ? resolved.sellerId : null,
        lastMessageAt: parsed.timestamp,
        status: "aguardando",
      });
      conversation = { id: created.id };
      if (resolved.kind === "lead") {
        await db.linkConversationToLead(resolved.id, created.id);
      }
    }
    const message = await db.insertOutboundEchoMessage({
      conversationId: conversation.id,
      provider,
      text: parsed.text ?? parsed.mediaCaption ?? "",
      mediaType: toMediaType(parsed.contentType),
      mediaFilename: parsed.mediaFilename ?? null,
      providerMessageId: parsed.providerMessageId,
      eventKey,
      sentAt: parsed.timestamp,
    });
    await db.touchConversation(conversation.id, parsed.timestamp);
    await db.markProcessed(eventKey, traceId);

    // Media (spec 2026-07-02): phone-sent media mirrors the inbound pipeline —
    // download now or mark failed; never blocks the echo record itself (the
    // message + markProcessed above already landed).
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
        warn("echo media download failed", {
          mediaId: parsed.mediaId,
          detail: error instanceof Error ? error.message : String(error),
        });
        await db.setMessageMedia(message.id, null, "failed");
      }
    }

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
        hasMedia: Boolean(parsed.mediaId),
        toPhoneMasked: `***${toDigits.slice(-4)}`,
        contactKind: resolved.kind,
        contactCreated: resolved.created,
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
      : provider === "evolution-go"
        ? await db.findEvolutionGoAccount(extractEvolutionGoInstance(rawPayload))
        : provider === "openwa"
          ? await db.findOpenWaAccount(extractOpenWaInstance(rawPayload))
          : await db.findEvolutionAccount(extractEvolutionInstance(rawPayload));
  if (!account) {
    warn("webhook for unknown account", { provider, toAccountPhone: parsed.toAccountPhone });
    return { outcome: "account-not-found" };
  }

  // 5. Contact resolution (RF-040.2, Frente 2 2026-07-13) — a real customer
  //    keeps today's behavior (unassigned pool conversation). An unknown
  //    number becomes a Lead (reused/reopened if one already exists for this
  //    phone) instead of a pending_review customer placeholder.
  const fromDigits = digits(parsed.fromPhone);
  const contactName = looksLikeName(parsed.senderName) ? parsed.senderName : undefined;
  const resolved = await resolveContact(db, account.storeId, parsed.fromPhone, contactName);
  if (resolved.kind === "customer") {
    if (contactName) {
      // Existing contact: always refresh whatsapp_name, and heal the display name
      // if it's still the phone placeholder. Best-effort: must never break the webhook.
      try {
        await db.applyInboundContactName(resolved.id, contactName);
      } catch (error) {
        warn("failed to fill customer name", {
          customerId: resolved.id,
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  // 6. Conversation resolution (RF-040.3) — OPEN-FIRST (PR #357): prefer the
  //    open conversation; only when none is open, look up regardless of status
  //    and REOPEN a closed one (resolvida/arquivada) on customer inbound
  //    instead of spawning a duplicate (spec 2026-07-03 §1.5). Open-first also
  //    removes the reopen-collision class under the
  //    one-open-per-contact-per-account unique index (migration
  //    20260723165509): a reopen only ever runs when no open row exists.
  let conversation: { id: string; status: string } | null =
    resolved.kind === "customer"
      ? await db.findOpenConversation(resolved.id, account.id)
      : await db.findOpenConversationForLead(resolved.id, account.id);
  if (!conversation) {
    conversation =
      resolved.kind === "customer"
        ? await db.findOpenConversation(resolved.id, account.id, true)
        : await db.findOpenConversationForLead(resolved.id, account.id, true);
  }
  let didReopen = false;
  if (!conversation) {
    const created = await db.createConversation({
      storeId: account.storeId,
      customerId: resolved.kind === "customer" ? resolved.id : null,
      leadId: resolved.kind === "lead" ? resolved.id : null,
      accountId: account.id,
      // Customer path: unassigned pool, unchanged from today — the auto-
      // created lead path assigns the lead's own seller immediately, keeping
      // Atendimento (assigned_seller_id) and Carteira (leads.seller_id)
      // consistent (docs/dev/conversation-access-model.md).
      assignedSellerId: resolved.kind === "lead" ? resolved.sellerId : null,
      lastMessageAt: parsed.timestamp,
      status: "aguardando",
    });
    conversation = { id: created.id, status: "aguardando" };
    if (resolved.kind === "lead") {
      await db.linkConversationToLead(resolved.id, created.id);
    }
  } else if (reopenOnInbound(conversation.status)) {
    await db.reopenConversation(conversation.id, parsed.timestamp);
    didReopen = true;
  }

  // SDR continuation (Parte B, 2026-07-15): fire-and-forget — never blocks
  // or affects the fail-closed response — the moment the conversation state
  // is known but before the current message is persisted (same point where
  // didReopen above is decided). Lead conversations always carry an assigned
  // seller (rotation), so sdr-backstop-tick's `assigned_seller_id IS NULL`
  // filter never activates SDR on them — this check is a no-op for leads by
  // construction, not a gap (Frente 2 2026-07-13 x SDR Parte B 2026-07-15).
  if (conversation && !resolved.created && (conversation as { isSdrActive?: boolean }).isSdrActive) {
    args.onSdrTurn?.({ conversationId: conversation.id });
  }

  // 7. Persist message (RF-050) BEFORE any media work — media now or never,
  //    but the message record never depends on the download succeeding.
  const message = await db.insertInboundMessage({
    conversationId: conversation.id,
    authorId: resolved.id,
    provider,
    text: parsed.text ?? parsed.mediaCaption ?? "",
    mediaType: toMediaType(parsed.contentType),
    mediaFilename: parsed.mediaFilename ?? null,
    providerMessageId: parsed.providerMessageId,
    eventKey,
    sentAt: parsed.timestamp,
  });
  // Skip the separate bump when we already reopened — reopenConversation
  // folds the last_message_at/unread_count bump in for that event.
  if (!didReopen) {
    await db.bumpConversation(conversation.id, parsed.timestamp);
  }

  // Idempotency mark RIGHT AFTER the message lands (RNF-002): a provider
  // retry from here on can never duplicate it. Media/audit/ad-referral below
  // are best-effort and must not reopen the duplication window.
  await db.markProcessed(eventKey, traceId);

  // Ad-source attribution (best-effort, AFTER the idempotency mark so a
  // transient failure here can never cause the message itself to be
  // reprocessed): overwrite with the LATEST referral seen — a customer can
  // return via a different ad months later, and the conversation should
  // reflect that, not freeze on the first one.
  if (parsed.adReferral) {
    try {
      await db.setConversationAdReferral(conversation.id, parsed.adReferral);
    } catch (error) {
      warn("ad-referral attribution failed", {
        conversationId: conversation.id,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

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
      contactKind: resolved.kind,
      contactCreated: resolved.created,
      traceId,
    },
  });

  return { outcome: "message-created", messageId: message.id, conversationId: conversation.id };
}
