/**
 * Outbound send pipeline core (PRD-115).
 *
 * Orchestrates a single send: explicit permission check (defense-in-depth on
 * top of RLS), Meta 24h-window pre-check, persist-before-send (queued →
 * sent | failed), provider dispatch and audit. The database surface is
 * injected ({@link ISendDb}) so the module is unit-testable; the
 * `whatsapp-send` Edge Function wires a service_role adapter.
 *
 * Runtime-agnostic file: relative imports only, Web APIs only.
 */

import { WhatsAppProviderError } from "../errors";
import { toE164 } from "../phone";
import { resolveEffectiveAccount, type IFailoverAwareAccount } from "../failover";
import type { IWhatsAppProvider } from "../IWhatsAppProvider";
import type { IAccountRecord } from "../webhook/core";
import type { OutboundMediaType } from "../types";

export type SendKind = "text" | "media" | "template";

export interface ISendRequest {
  conversationId: string;
  kind: SendKind;
  text?: string;
  /** Storage path in whatsapp-media OR an absolute URL the provider can fetch. */
  mediaPath?: string;
  mediaType?: OutboundMediaType;
  /**
   * Original filename of the picked file (PRD-119). Threaded to providers that
   * label documents with it (Meta `document.filename`, Evolution `fileName`);
   * ignored for image/audio/video.
   */
  fileName?: string;
  templateName?: string;
  templateLanguage?: string;
  templateParameters?: string[];
  replyToMessageId?: string;
  /**
   * PRD-118 RF-051: staff confirmation to send to a customer whose number is
   * flagged `whatsapp_status='invalid'`. Sellers cannot override.
   */
  overrideInvalid?: boolean;
  /**
   * PRD-118 RF-040: id of the failed message this send retries. The failed
   * row is never mutated — this creates a NEW message; audit gets
   * `action='dispatch_retry'` with the original id.
   */
  retryOfMessageId?: string;
  /**
   * Client-generated message id (UUID). When provided, the outbound row is
   * inserted with THIS id so the optimistic bubble and the Realtime INSERT
   * share one id — no duplicate bubble during the send window. Omitted (or
   * invalid) → the database generates the id.
   */
  messageId?: string;
}

export interface ISender {
  sellerId: string | null;
  role: string;
  storeId: string;
}

export interface ISendConversationContext {
  conversation: {
    id: string;
    storeId: string;
    status: string;
    assignedSellerId: string | null;
  };
  /** Primary account of the conversation, with the PRD-120 failover columns. */
  account: IFailoverAwareAccount | null;
  customerId: string | null;
  customerPhone: string | null;
  /** customers.whatsapp_status — drives the invalid-number gate (PRD-118). */
  customerWhatsappStatus: string | null;
}

export interface ISendDb {
  getSendContext(conversationId: string): Promise<ISendConversationContext | null>;
  /** PRD-120: loads the failover (backup) account row. Null when missing. */
  getAccountRecord(accountId: string): Promise<IAccountRecord | null>;
  isWithin24hWindow(conversationId: string): Promise<boolean>;
  insertQueuedMessage(input: {
    /** Client-provided UUID for the row id (optimistic dedup); adapter validates. */
    messageId?: string;
    conversationId: string;
    sellerId: string | null;
    provider: "meta" | "evolution";
    text: string;
    mediaType: string | null;
    mediaUrl: string | null;
  }): Promise<{ id: string }>;
  markMessageSent(messageId: string, providerMessageId: string): Promise<void>;
  markMessageFailed(messageId: string, failureReason: string, failureCode?: string): Promise<void>;
  /** PRD-118 RF-050 (sync path): customers.whatsapp_status = 'invalid'. */
  markCustomerWhatsappInvalid(customerId: string): Promise<void>;
  /** Outbound touch: last_message_at only — unread_count belongs to inbound. */
  touchConversation(conversationId: string, lastMessageAt: string): Promise<void>;
  /** Signs a whatsapp-media storage path (short TTL) for the provider to fetch. */
  createSignedMediaUrl(path: string): Promise<string>;
  audit(input: {
    storeId: string;
    actorId: string;
    action: string;
    resource: string;
    resourceId: string;
    after: Record<string, unknown>;
  }): Promise<void>;
}

export interface ISendResultPayload {
  messageId: string;
  providerMessageId: string;
  dispatchStatus: "sent";
}

const STAFF_ROLES = ["owner", "manager"];
const CLOSED_STATUSES = ["resolvida", "arquivada"];
const MAX_TEXT_LENGTH = 4096;

function validationError(message: string): WhatsAppProviderError {
  return new WhatsAppProviderError("VALIDATION_ERROR", 422, message);
}

/** Throws VALIDATION_ERROR unless the request shape matches its kind. */
export function validateSendRequest(input: ISendRequest): void {
  if (!input.conversationId) throw validationError("conversationId é obrigatório");
  if (!["text", "media", "template"].includes(input.kind)) {
    throw validationError(`kind inválido: ${String(input.kind)}`);
  }
  if (input.kind === "text") {
    if (!input.text || input.text.trim().length === 0) {
      throw validationError("Texto não pode ser vazio");
    }
    if (input.text.length > MAX_TEXT_LENGTH) {
      throw validationError(`Texto deve ter no máximo ${MAX_TEXT_LENGTH} caracteres`);
    }
  }
  if (input.kind === "media") {
    if (!input.mediaPath) throw validationError("mediaPath é obrigatório para kind=media");
    if (!input.mediaType) throw validationError("mediaType é obrigatório para kind=media");
  }
  if (input.kind === "template") {
    if (!input.templateName) throw validationError("templateName é obrigatório");
    if (!input.templateLanguage) throw validationError("templateLanguage é obrigatório");
  }
}

export async function processSendRequest(args: {
  input: ISendRequest;
  sender: ISender;
  db: ISendDb;
  buildProvider: (account: IAccountRecord) => IWhatsAppProvider;
  traceId: string;
}): Promise<ISendResultPayload> {
  const { input, sender, db, traceId } = args;
  validateSendRequest(input);

  const context = await db.getSendContext(input.conversationId);
  if (!context) {
    throw new WhatsAppProviderError("NOT_FOUND", 404, "Conversa não encontrada");
  }
  const { conversation, account, customerId, customerPhone, customerWhatsappStatus } = context;

  // Permission (RF-010/011) — staff of the store, the assigned seller, or any
  // seller of the store when the conversation sits in the pool (assigned null,
  // mirroring the RLS claim model).
  const sameStore = conversation.storeId === sender.storeId;
  const isStaff = STAFF_ROLES.includes(sender.role);
  const isAssignee =
    sender.sellerId !== null &&
    (conversation.assignedSellerId === sender.sellerId || conversation.assignedSellerId === null);
  if (!sameStore || (!isStaff && !isAssignee)) {
    throw new WhatsAppProviderError("FORBIDDEN", 403, "Sem permissão para enviar nesta conversa");
  }

  if (CLOSED_STATUSES.includes(conversation.status)) {
    throw new WhatsAppProviderError(
      "CONVERSATION_CLOSED",
      422,
      "Conversa encerrada — reabra antes de enviar",
    );
  }

  // Invalid-number gate (PRD-118 RF-051): a number flagged by Meta 131026
  // bounces with a dedicated code so the UI can offer the staff-only
  // confirmation; sellers cannot override. Override is audited.
  if (customerWhatsappStatus === "invalid") {
    if (!input.overrideInvalid) {
      throw new WhatsAppProviderError(
        "CUSTOMER_INVALID_WHATSAPP",
        422,
        "Número marcado como inválido no WhatsApp. Confirme antes de enviar.",
      );
    }
    if (!isStaff) {
      throw new WhatsAppProviderError(
        "FORBIDDEN",
        403,
        "Apenas Owner/Gestor pode enviar para número marcado como inválido",
      );
    }
    await db.audit({
      storeId: conversation.storeId,
      actorId: sender.sellerId ?? "staff",
      action: "dispatch_override_invalid",
      resource: "customer",
      resourceId: customerId ?? conversation.id,
      after: { conversationId: conversation.id, traceId },
    });
  }

  if (!account) {
    throw validationError("Conversa sem conta WhatsApp vinculada");
  }
  if (!customerPhone) {
    throw validationError("Cliente da conversa sem telefone cadastrado");
  }
  const to = toE164(customerPhone.replace(/\D/g, ""));

  // PRD-120 RF-040: effective account — an ACTIVE failover routes NEW
  // outbound through the backup account (history stays on the primary; the
  // 24h pre-check below must use the EFFECTIVE provider). Templates require
  // a Meta backup (FAILOVER_INCOMPATIBLE otherwise — RF-041).
  let effectiveAccount: IAccountRecord = account;
  let usedFailover = false;
  if (account.isFailoverActive && account.failoverAccountId) {
    const failoverRow = await db.getAccountRecord(account.failoverAccountId);
    const resolved = resolveEffectiveAccount({
      primary: account,
      failover: failoverRow,
      kind: input.kind,
    });
    effectiveAccount = resolved.account;
    usedFailover = resolved.usedFailover;
    if (usedFailover) {
      await db.audit({
        storeId: conversation.storeId,
        actorId: sender.sellerId ?? "staff",
        action: "failover_used",
        resource: "whatsapp_account",
        resourceId: account.id,
        after: {
          toAccountId: effectiveAccount.id,
          conversationId: conversation.id,
          kind: input.kind,
          traceId,
        },
      });
    }
  }

  // Meta 24h window pre-check (RF-020..023): free text AND media captions are
  // free-form content; templates exist precisely for outside the window.
  if (effectiveAccount.provider === "meta" && input.kind !== "template") {
    const within = await db.isWithin24hWindow(conversation.id);
    if (!within) {
      throw new WhatsAppProviderError(
        "TEMPLATE_REQUIRED",
        422,
        "Fora da janela de 24h. Use um template HSM.",
      );
    }
  }

  // Persist BEFORE dispatch (RNF-002) — a provider failure leaves a visible
  // failed message, never a ghost sent only on the provider side.
  const message = await db.insertQueuedMessage({
    messageId: input.messageId,
    conversationId: conversation.id,
    sellerId: sender.sellerId,
    provider: effectiveAccount.provider,
    text: input.text ?? "",
    mediaType: input.kind === "media" ? (input.mediaType ?? null) : null,
    mediaUrl: input.kind === "media" ? (input.mediaPath ?? null) : null,
  });

  const engine = args.buildProvider(effectiveAccount);
  try {
    let providerMessageId: string;
    if (input.kind === "text") {
      const result = await engine.sendText({
        accountId: effectiveAccount.id,
        to,
        text: input.text ?? "",
        replyToMessageId: input.replyToMessageId,
        traceId,
      });
      providerMessageId = result.providerMessageId;
    } else if (input.kind === "media") {
      const mediaPath = input.mediaPath ?? "";
      const url = mediaPath.startsWith("http")
        ? mediaPath
        : await db.createSignedMediaUrl(mediaPath);
      const result = await engine.sendMedia({
        accountId: effectiveAccount.id,
        to,
        mediaType: input.mediaType as OutboundMediaType,
        mediaIdOrUrl: url,
        caption: input.text || undefined,
        filename: input.fileName,
        traceId,
      });
      providerMessageId = result.providerMessageId;
    } else {
      const result = await engine.sendTemplate({
        accountId: effectiveAccount.id,
        to,
        templateName: input.templateName ?? "",
        languageCode: input.templateLanguage ?? "",
        bodyParameters: input.templateParameters,
        traceId,
      });
      providerMessageId = result.providerMessageId;
    }

    await db.markMessageSent(message.id, providerMessageId);
    const sentAt = new Date().toISOString();
    await db.touchConversation(conversation.id, sentAt);
    await db.audit({
      storeId: conversation.storeId,
      actorId: sender.sellerId ?? "staff",
      action: input.retryOfMessageId ? "dispatch_retry" : "dispatch",
      resource: "message",
      resourceId: message.id,
      after: {
        provider: effectiveAccount.provider,
        kind: input.kind,
        success: true,
        providerMessageId,
        ...(usedFailover ? { usedFailover: true, accountId: effectiveAccount.id } : {}),
        ...(input.retryOfMessageId ? { originalMessageId: input.retryOfMessageId } : {}),
        traceId,
      },
    });
    return { messageId: message.id, providerMessageId, dispatchStatus: "sent" };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Erro desconhecido no provider";
    const providerCode =
      error instanceof WhatsAppProviderError && error.details?.metaCode !== undefined
        ? String(error.details.metaCode)
        : undefined;
    await db.markMessageFailed(message.id, reason, providerCode);

    // PRD-118 RF-050 (synchronous variant): Meta can reject 131026 directly
    // on the send call. Best-effort flag — never masks the dispatch error.
    if (providerCode === "131026" && customerId) {
      try {
        await db.markCustomerWhatsappInvalid(customerId);
      } catch {
        /* best-effort */
      }
    }
    await db.audit({
      storeId: conversation.storeId,
      actorId: sender.sellerId ?? "staff",
      action: input.retryOfMessageId ? "dispatch_retry" : "dispatch",
      resource: "message",
      resourceId: message.id,
      after: {
        provider: effectiveAccount.provider,
        kind: input.kind,
        success: false,
        errorCode: error instanceof WhatsAppProviderError ? error.code : "UNKNOWN",
        ...(usedFailover ? { usedFailover: true, accountId: effectiveAccount.id } : {}),
        ...(input.retryOfMessageId ? { originalMessageId: input.retryOfMessageId } : {}),
        traceId,
      },
    });
    throw error;
  }
}
