// AUTO-GENERATED MIRROR — DO NOT EDIT.
// Source: src/providers/whatsapp/evolution/parser.ts (sync: bun run scripts/sync-whatsapp-shared.ts)

/**
 * Evolution webhook event parser (PRD-113 RF-060).
 *
 * Evolution (v2) posts `{ event, instance, data, sender?, ... }`:
 * - `messages.upsert` with `data.key.fromMe=false` → inbound message;
 * - `messages.update` with `data.status` → delivery status.
 * Own-message echoes (`fromMe=true`) and other events throw — PRD-114's
 * webhook decides to ignore them (parse errors on known-own events ≠ failures).
 */

import { toE164 } from "../phone.ts";
import type { IInboundMessage, IInboundStatus, InboundContentType } from "../types.ts";

interface IEvolutionEvent {
  event?: string;
  instance?: string;
  /** Instance's own jid (e.g. 5555911111111@s.whatsapp.net) on v2 payloads. */
  sender?: string;
  data?: IEvolutionMessageData;
}

interface IEvolutionMessageData {
  key?: { id?: string; remoteJid?: string; fromMe?: boolean };
  keyId?: string;
  pushName?: string;
  status?: string;
  message?: {
    conversation?: string;
    extendedTextMessage?: { text?: string };
    imageMessage?: { caption?: string; mimetype?: string };
    audioMessage?: { mimetype?: string };
    videoMessage?: { caption?: string; mimetype?: string };
    documentMessage?: { caption?: string; fileName?: string; mimetype?: string };
    locationMessage?: { degreesLatitude?: number; degreesLongitude?: number; name?: string };
    contactMessage?: { displayName?: string };
  };
  messageTimestamp?: number | string;
}

function jidToE164(jid: string | undefined): string {
  if (!jid) return "";
  return toE164(jid.split("@")[0] ?? "");
}

function timestampToIso(value: number | string | undefined): string {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0
    ? new Date(parsed * 1000).toISOString()
    : new Date().toISOString();
}

/** Baileys ack states → normalized status. */
const STATUS_MAP: Record<string, IInboundStatus["status"]> = {
  SERVER_ACK: "sent",
  DELIVERY_ACK: "delivered",
  READ: "read",
  PLAYED: "read",
  ERROR: "failed",
};

export function parseEvolutionInbound(
  rawPayload: unknown,
  accountId: string,
): IInboundMessage | IInboundStatus {
  const event = rawPayload as IEvolutionEvent | null;
  const data = event?.data;
  if (!event?.event || !data) {
    throw new Error(
      "EvolutionProvider: payload de webhook irreconhecível (esperado { event, data })",
    );
  }

  if (event.event === "messages.update") {
    const status = STATUS_MAP[(data.status ?? "").toUpperCase()];
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
  if (data.key?.fromMe) {
    throw new Error(
      "EvolutionProvider: messages.upsert com fromMe=true (eco da própria conta) — ignorar",
    );
  }

  const message = data.message ?? {};
  let contentType: InboundContentType = "unknown";
  let text: string | undefined;
  let mediaCaption: string | undefined;

  if (message.conversation !== undefined || message.extendedTextMessage) {
    contentType = "text";
    text = message.conversation ?? message.extendedTextMessage?.text;
  } else if (message.imageMessage) {
    contentType = "image";
    mediaCaption = message.imageMessage.caption;
  } else if (message.audioMessage) {
    contentType = "audio";
  } else if (message.videoMessage) {
    contentType = "video";
    mediaCaption = message.videoMessage.caption;
  } else if (message.documentMessage) {
    contentType = "document";
    mediaCaption = message.documentMessage.caption;
  } else if (message.locationMessage) {
    contentType = "location";
    const { name, degreesLatitude, degreesLongitude } = message.locationMessage;
    text = [name, `${degreesLatitude ?? "?"},${degreesLongitude ?? "?"}`]
      .filter(Boolean)
      .join(" — ");
  } else if (message.contactMessage) {
    contentType = "contact";
    text = message.contactMessage.displayName;
  }

  const hasMedia = ["image", "audio", "video", "document"].includes(contentType);
  return {
    type: "message",
    providerMessageId: data.key?.id ?? "",
    fromPhone: jidToE164(data.key?.remoteJid),
    // Evolution does not echo the receiving number per message; `sender` (the
    // instance's own jid) covers it on v2. PRD-114 resolves the account by
    // instance name anyway — accountId below is the authoritative link.
    toAccountPhone: jidToE164(event.sender),
    accountId,
    contentType,
    text,
    // Evolution media downloads by MESSAGE key id (getBase64FromMediaMessage).
    mediaId: hasMedia ? data.key?.id : undefined,
    mediaCaption,
    timestamp: timestampToIso(data.messageTimestamp),
    rawPayload,
  };
}
