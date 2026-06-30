/**
 * Evolution webhook event parser (PRD-113 RF-060).
 *
 * Evolution (v2) posts `{ event, instance, data, sender?, ... }`:
 * - `messages.upsert` with `data.key.fromMe=false` → inbound message;
 * - `messages.upsert` with `data.key.fromMe=true` → outbound echo, mirrored
 *   into the conversation by the webhook (spec 2026-06-11-whatsapp-real-inbox);
 *   app-sent messages also echo — consumers dedup by providerMessageId;
 * - `messages.update` with `data.status` → delivery status.
 * JIDs matching `@g.us`, `@broadcast`, or `@newsletter` throw (group /
 * broadcast / newsletter — ignored upstream, no 1:1 customer mapping);
 * `@lid` jids also throw (individual chat but no resolvable phone).
 */

import { toE164 } from "../phone";
import { encodeBaileysContact, encodeBaileysLocation } from "../contentFormat";
import type { IInboundMessage, IInboundStatus, InboundContentType, IOutboundEcho } from "../types";

interface IEvolutionEvent {
  event?: string;
  instance?: string;
  /** Instance's own jid (e.g. 5555911111111@s.whatsapp.net) on v2 payloads. */
  sender?: string;
  data?: IEvolutionMessageData;
}

/** Raw Evolution/Baileys message body — shared with the history import core. */
export interface IEvolutionRawMessage {
  conversation?: string;
  extendedTextMessage?: { text?: string };
  imageMessage?: { caption?: string; mimetype?: string };
  audioMessage?: { mimetype?: string };
  videoMessage?: { caption?: string; mimetype?: string };
  documentMessage?: { caption?: string; fileName?: string; mimetype?: string };
  locationMessage?: {
    degreesLatitude?: number;
    degreesLongitude?: number;
    name?: string;
    address?: string;
  };
  contactMessage?: { displayName?: string; vcard?: string };
  /** Multi-contact share — Baileys nests the cards under `contacts[]`. */
  contactsArrayMessage?: { contacts?: Array<{ displayName?: string; vcard?: string }> };
}

interface IEvolutionMessageData {
  key?: { id?: string; remoteJid?: string; fromMe?: boolean };
  keyId?: string;
  pushName?: string;
  status?: string;
  message?: IEvolutionRawMessage;
  messageTimestamp?: number | string;
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

/** Baileys ack states → normalized status (shared with the import core). */
export const EVOLUTION_ACK_STATUS_MAP: Record<string, IInboundStatus["status"]> = {
  SERVER_ACK: "sent",
  DELIVERY_ACK: "delivered",
  READ: "read",
  PLAYED: "read",
  ERROR: "failed",
};

export interface IEvolutionContent {
  contentType: InboundContentType;
  text?: string;
  mediaCaption?: string;
}

/** Normalizes the raw message body into contentType/text/caption. */
export function extractEvolutionContent(message: IEvolutionRawMessage): IEvolutionContent {
  if (message.conversation !== undefined || message.extendedTextMessage) {
    return { contentType: "text", text: message.conversation ?? message.extendedTextMessage?.text };
  }
  if (message.imageMessage)
    return { contentType: "image", mediaCaption: message.imageMessage.caption };
  if (message.audioMessage) return { contentType: "audio" };
  if (message.videoMessage)
    return { contentType: "video", mediaCaption: message.videoMessage.caption };
  if (message.documentMessage)
    return { contentType: "document", mediaCaption: message.documentMessage.caption };
  if (message.locationMessage) {
    return { contentType: "location", text: encodeBaileysLocation(message.locationMessage) };
  }
  // Single contact OR the first card of a multi-contact share (we surface one
  // card; the rest stay in rawPayload — multi-card rendering is out of scope).
  const contactNode = message.contactMessage ?? message.contactsArrayMessage?.contacts?.[0];
  if (contactNode) {
    return { contentType: "contact", text: encodeBaileysContact(contactNode) };
  }
  return { contentType: "unknown" };
}

/** JIDs that are NOT individual 1:1 chats (groups, broadcast lists, newsletters). */
const NON_INDIVIDUAL_JID = /@(g\.us|broadcast|newsletter)$/;

export function parseEvolutionInbound(
  rawPayload: unknown,
  accountId: string,
): IInboundMessage | IInboundStatus | IOutboundEcho {
  const event = rawPayload as IEvolutionEvent | null;
  const data = event?.data;
  if (!event?.event || !data) {
    throw new Error(
      "EvolutionProvider: payload de webhook irreconhecível (esperado { event, data })",
    );
  }

  if (event.event === "messages.update") {
    // Some Baileys builds report the ack as a NUMBER — String() before uppercasing.
    const status = EVOLUTION_ACK_STATUS_MAP[String(data.status ?? "").toUpperCase()];
    if (!status) {
      throw new Error(`EvolutionProvider: messages.update com status desconhecido: ${data.status}`);
    }
    return {
      type: "status",
      providerMessageId: data.keyId ?? data.key?.id ?? "",
      status,
      failureReason: status === "failed" ? data.status : undefined,
      timestamp: timestampToIso(data.messageTimestamp),
      rawPayload,
    };
  }

  if (event.event !== "messages.upsert") {
    throw new Error(`EvolutionProvider: evento não suportado pelo parser: ${event.event}`);
  }

  const remoteJid = data.key?.remoteJid ?? "";
  if (NON_INDIVIDUAL_JID.test(remoteJid)) {
    throw new Error(
      "EvolutionProvider: messages.upsert de grupo/broadcast/newsletter — ignorar (sem cliente 1:1)",
    );
  }

  // @lid = WhatsApp privacy "linked id": an individual chat, but with no
  // resolvable phone number — minting an E.164 from it would create junk
  // customers. Ignored until Evolution exposes the real number (senderPn).
  if (remoteJid.endsWith("@lid")) {
    throw new Error(
      "EvolutionProvider: messages.upsert com jid @lid (sem telefone resolvível) — ignorar",
    );
  }

  const content = extractEvolutionContent(data.message ?? {});

  if (data.key?.fromMe) {
    return {
      type: "outbound-echo",
      providerMessageId: data.key?.id ?? "",
      toPhone: jidToE164(remoteJid),
      contentType: content.contentType,
      text: content.text,
      mediaCaption: content.mediaCaption,
      timestamp: timestampToIso(data.messageTimestamp),
      rawPayload,
    };
  }

  const hasMedia = ["image", "audio", "video", "document"].includes(content.contentType);
  return {
    type: "message",
    providerMessageId: data.key?.id ?? "",
    fromPhone: jidToE164(remoteJid),
    // Evolution does not echo the receiving number per message; `sender` (the
    // instance's own jid) covers it on v2. PRD-114 resolves the account by
    // instance name anyway — accountId below is the authoritative link.
    toAccountPhone: jidToE164(event.sender),
    accountId,
    contentType: content.contentType,
    text: content.text,
    // Evolution media downloads by MESSAGE key id (getBase64FromMediaMessage).
    mediaId: hasMedia ? data.key?.id : undefined,
    mediaCaption: content.mediaCaption,
    // Contact's WhatsApp profile name — used to name auto-created customers.
    senderName: data.pushName,
    timestamp: timestampToIso(data.messageTimestamp),
    rawPayload,
  };
}
