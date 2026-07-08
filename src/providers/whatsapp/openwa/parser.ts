/**
 * OpenWA webhook event parser.
 *
 * The MESSAGE RECORD shape below is CONFIRMED live (2026-07-07, `GET
 * /sessions/{id}/messages` against a real connected session):
 *   { id, sessionId, waMessageId, chatId, chatName, from, to, body, type,
 *     direction: "incoming"|"outgoing", timestamp (unix seconds),
 *     metadata: null | { media: { mimetype, data (base64), filename? } },
 *     status, createdAt }
 * `id` is this server's OWN row uuid (session-scoped); `waMessageId` is the
 * real cross-network WhatsApp message id — use THAT for provider_message_id /
 * ack correlation, never `id`.
 *
 * The WEBHOOK ENVELOPE wrapping this record is NOT verified against a live
 * delivery (the registered webhook events are `message.received`,
 * `message.ack`, `message.sent`, `session.status`, `session.qr` — confirmed
 * live via `POST /sessions/{id}/webhooks`). Best-effort inferred shape:
 * `{ event, sessionId, data }` where `data` is the message record above for
 * message.* events. Confirm on first real pairing (see
 * docs/dev/whatsapp-openwa-provider.md) and adjust if the real envelope
 * differs — the parser is defensive: it also accepts the bare message record
 * with no envelope (`data` falls back to the whole payload), so a shape
 * mismatch degrades to "ignored" (webhook core drops throws as RNF-007
 * no-ops) rather than crashing.
 *
 * `session.status`/`session.qr` events carry no message — parsing them
 * throws "unsupported", which the webhook core treats as an ignorable no-op
 * (same convention as an unrecognized ack value). No media-by-id fetch exists
 * on this server (confirmed: no GET .../messages/{id} or .../media route) —
 * media only ever arrives INLINE in `metadata.media`, so `mediaId` here
 * packs the decoded bytes directly (JSON envelope) instead of an opaque
 * reference, and `OpenWaProvider.downloadInboundMedia` unpacks it locally
 * with NO further HTTP call.
 */

import { toE164 } from "../phone";
import { encodeContact, encodeLocation, phoneFromVCard } from "../contentFormat";
import type { IInboundMessage, IInboundStatus, InboundContentType, IOutboundEcho } from "../types";

const CONFIRMED_MESSAGE_EVENTS = new Set(["message.received", "message.sent", "message.ack"]);

interface IOpenWaMediaMetadata {
  mimetype?: string;
  data?: string;
  filename?: string;
}

interface IOpenWaMessageRecord {
  id?: string;
  sessionId?: string;
  waMessageId?: string;
  chatId?: string;
  chatName?: string;
  from?: string;
  to?: string;
  body?: string;
  type?: string;
  direction?: "incoming" | "outgoing";
  timestamp?: number | string;
  metadata?: { media?: IOpenWaMediaMetadata } | null;
  status?: string;
  createdAt?: string;
  // Ack-style events MAY arrive as a minimal delta rather than the full record.
  ack?: string;
}

interface IOpenWaWebhookEnvelope {
  event?: string;
  sessionId?: string;
  data?: IOpenWaMessageRecord;
}

export function jidToE164(jid: string | undefined): string {
  if (!jid) return "";
  return toE164(jid.split("@")[0]?.split(":")[0] ?? "");
}

export function timestampToIso(value: number | string | undefined): string {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0
    ? new Date(parsed * 1000).toISOString()
    : new Date().toISOString();
}

/** Known message.ack / message record status strings → normalized status. */
const OPENWA_STATUS_MAP: Record<string, IInboundStatus["status"]> = {
  sent: "sent",
  delivered: "delivered",
  read: "read",
  played: "read",
  failed: "failed",
  error: "failed",
};

export interface IOpenWaContent {
  contentType: InboundContentType;
  text?: string;
  mediaCaption?: string;
  mediaFilename?: string;
}

const MEDIA_MESSAGE_TYPES = new Set(["image", "video", "ptt", "audio", "document", "sticker"]);

/** Normalizes the raw message body into contentType/text/caption. */
export function extractOpenWaContent(message: IOpenWaMessageRecord): IOpenWaContent {
  const type = message.type ?? "text";
  if (type === "text" || type === "chat") {
    return { contentType: "text", text: message.body };
  }
  if (type === "image" || type === "sticker") {
    return { contentType: "image", mediaCaption: message.body };
  }
  if (type === "ptt" || type === "audio") {
    return { contentType: "audio" };
  }
  if (type === "video") {
    return { contentType: "video", mediaCaption: message.body };
  }
  if (type === "document") {
    return {
      contentType: "document",
      mediaCaption: message.body,
      mediaFilename: message.metadata?.media?.filename,
    };
  }
  if (type === "location") {
    // Location payload shape not confirmed live — best-effort parse if the
    // body carries an encoded location (see encodeLocation/decodeLocation).
    return { contentType: "location", text: message.body };
  }
  if (type === "vcard" || type === "multi_vcard" || type === "contact") {
    return {
      contentType: "contact",
      text: encodeContact({ name: message.body, phone: phoneFromVCard(message.body ?? "") }),
    };
  }
  return { contentType: "unknown" };
}

/** JIDs that are NOT individual 1:1 chats (groups, broadcast lists, newsletters). */
const NON_INDIVIDUAL_JID = /@(g\.us|broadcast|newsletter)$/;

/** Packs decoded media bytes into the opaque `mediaId` — no download endpoint exists. */
function packMediaId(media: IOpenWaMediaMetadata): string {
  return JSON.stringify({
    data: media.data ?? "",
    mimeType: media.mimetype ?? "application/octet-stream",
    filename: media.filename,
  });
}

export function parseOpenWaInbound(
  rawPayload: unknown,
  accountId: string,
): IInboundMessage | IInboundStatus | IOutboundEcho {
  const envelope = rawPayload as IOpenWaWebhookEnvelope | null;
  // Defensive: accept either the documented { event, sessionId, data }
  // envelope or a bare message record with no wrapper — but only when the
  // bare object actually looks like a message (has `from`/`chatId`/`waMessageId`),
  // so genuinely unrecognizable payloads still throw instead of silently
  // producing a message with every field empty.
  const event = envelope?.event;
  const bareRecord = envelope as IOpenWaMessageRecord | null;
  const looksLikeMessage = Boolean(bareRecord?.from || bareRecord?.chatId || bareRecord?.waMessageId);
  const message: IOpenWaMessageRecord | undefined =
    envelope?.data ?? (looksLikeMessage ? (bareRecord ?? undefined) : undefined);

  if (!message) {
    throw new Error("OpenWaProvider: payload de webhook irreconhecível (sem corpo de mensagem)");
  }

  if (event && !CONFIRMED_MESSAGE_EVENTS.has(event)) {
    throw new Error(`OpenWaProvider: evento não suportado pelo parser: ${event}`);
  }

  if (event === "message.ack") {
    const statusRaw = message.status ?? message.ack ?? "";
    const status = OPENWA_STATUS_MAP[statusRaw.toLowerCase()];
    if (!status) {
      throw new Error(`OpenWaProvider: evento ack com status desconhecido: ${statusRaw}`);
    }
    const providerMessageId = message.waMessageId ?? message.id ?? "";
    return {
      type: "status",
      providerMessageId,
      status,
      failureReason: status === "failed" ? statusRaw : undefined,
      timestamp: timestampToIso(message.timestamp),
      rawPayload,
    };
  }

  const remoteJid = message.direction === "outgoing" ? (message.to ?? "") : (message.from ?? "");
  if (NON_INDIVIDUAL_JID.test(remoteJid)) {
    throw new Error("OpenWaProvider: mensagem de grupo/broadcast/newsletter — ignorar (sem cliente 1:1)");
  }
  if (remoteJid.endsWith("@lid")) {
    throw new Error("OpenWaProvider: mensagem com jid @lid (sem telefone resolvível) — ignorar");
  }

  const content = extractOpenWaContent(message);
  const hasMedia = MEDIA_MESSAGE_TYPES.has(message.type ?? "") && Boolean(message.metadata?.media);
  const providerMessageId = message.waMessageId ?? message.id ?? "";
  const mediaId = hasMedia ? packMediaId(message.metadata!.media!) : undefined;

  if (message.direction === "outgoing") {
    return {
      type: "outbound-echo",
      providerMessageId,
      toPhone: jidToE164(remoteJid),
      contentType: content.contentType,
      text: content.text,
      mediaId,
      mediaCaption: content.mediaCaption,
      mediaFilename: content.mediaFilename,
      timestamp: timestampToIso(message.timestamp),
      rawPayload,
    };
  }

  return {
    type: "message",
    providerMessageId,
    fromPhone: jidToE164(remoteJid),
    toAccountPhone: jidToE164(message.to),
    accountId,
    contentType: content.contentType,
    text: content.text,
    mediaId,
    mediaCaption: content.mediaCaption,
    mediaFilename: content.mediaFilename,
    senderName: message.chatName,
    timestamp: timestampToIso(message.timestamp),
    rawPayload,
  };
}
