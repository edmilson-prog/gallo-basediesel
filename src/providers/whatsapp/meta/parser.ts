/**
 * Meta webhook payload parser (PRD-112 RF-090).
 *
 * Meta nests events in `entry[].changes[].value` — `value.messages[]` for
 * inbound messages, `value.statuses[]` for delivery updates. The parser is
 * pure: it never touches the network or the database; `accountId` comes from
 * the provider instance that owns the parse (the caller resolved it).
 */

import { toE164 } from "../phone";
import type { IInboundMessage, IInboundStatus, InboundContentType } from "../types";

interface IMetaWebhookValue {
  metadata?: { display_phone_number?: string; phone_number_id?: string };
  messages?: IMetaInboundMessage[];
  statuses?: IMetaInboundStatus[];
}

interface IMetaInboundMessage {
  id?: string;
  from?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  image?: IMetaMediaObject;
  audio?: IMetaMediaObject;
  video?: IMetaMediaObject;
  document?: IMetaMediaObject & { filename?: string };
  sticker?: IMetaMediaObject;
  location?: { latitude?: number; longitude?: number; name?: string; address?: string };
  contacts?: unknown[];
  interactive?: {
    type?: string;
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string; description?: string };
  };
  button?: { text?: string; payload?: string };
}

interface IMetaMediaObject {
  id?: string;
  caption?: string;
  mime_type?: string;
}

interface IMetaInboundStatus {
  id?: string;
  status?: string;
  timestamp?: string;
  errors?: Array<{ code?: number; title?: string; message?: string }>;
}

function unixToIso(unixSeconds: string | undefined): string {
  const parsed = Number(unixSeconds);
  return Number.isFinite(parsed) && parsed > 0
    ? new Date(parsed * 1000).toISOString()
    : new Date().toISOString();
}

function extractValue(rawPayload: unknown): IMetaWebhookValue | null {
  const payload = rawPayload as {
    entry?: Array<{ changes?: Array<{ value?: IMetaWebhookValue }> }>;
  } | null;
  return payload?.entry?.[0]?.changes?.[0]?.value ?? null;
}

const STATUS_MAP: Record<string, IInboundStatus["status"]> = {
  sent: "sent",
  delivered: "delivered",
  read: "read",
  failed: "failed",
};

const MEDIA_TYPES = ["image", "audio", "video", "document", "sticker"] as const;

export function parseMetaInbound(
  rawPayload: unknown,
  accountId: string,
): IInboundMessage | IInboundStatus {
  const value = extractValue(rawPayload);
  if (!value) {
    throw new Error(
      "MetaCloudProvider: payload de webhook irreconhecível (esperado entry[].changes[].value)",
    );
  }

  const status = value.statuses?.[0];
  if (status) {
    return {
      type: "status",
      providerMessageId: status.id ?? "",
      status: STATUS_MAP[status.status ?? ""] ?? "failed",
      failureReason: status.errors?.[0]?.message ?? status.errors?.[0]?.title ?? undefined,
      failureCode:
        status.errors?.[0]?.code !== undefined ? String(status.errors[0]?.code) : undefined,
      timestamp: unixToIso(status.timestamp),
      rawPayload,
    };
  }

  const message = value.messages?.[0];
  if (!message) {
    throw new Error("MetaCloudProvider: payload sem messages[] nem statuses[] — nada a normalizar");
  }

  const base = {
    type: "message" as const,
    providerMessageId: message.id ?? "",
    fromPhone: toE164(message.from ?? ""),
    toAccountPhone: toE164(value.metadata?.display_phone_number ?? ""),
    accountId,
    timestamp: unixToIso(message.timestamp),
    rawPayload,
  };

  const type = message.type ?? "unknown";

  if (type === "text") {
    return { ...base, contentType: "text", text: message.text?.body };
  }

  if ((MEDIA_TYPES as readonly string[]).includes(type)) {
    const media = message[type as (typeof MEDIA_TYPES)[number]];
    // Stickers ride as images in the normalized model (no dedicated kind).
    const contentType: InboundContentType =
      type === "sticker" ? "image" : (type as InboundContentType);
    return {
      ...base,
      contentType,
      mediaId: media?.id,
      mediaCaption: media?.caption,
    };
  }

  if (type === "location") {
    const { latitude, longitude, name } = message.location ?? {};
    return {
      ...base,
      contentType: "location",
      text: [name, `${latitude ?? "?"},${longitude ?? "?"}`].filter(Boolean).join(" — "),
    };
  }

  if (type === "contacts") {
    return { ...base, contentType: "contact" };
  }

  // Interactive replies (button/list) normalize to text — the tapped title is
  // the user's answer; the structured detail stays in rawPayload.
  if (type === "interactive") {
    const reply = message.interactive?.button_reply ?? message.interactive?.list_reply;
    return { ...base, contentType: "text", text: reply?.title };
  }
  if (type === "button") {
    return { ...base, contentType: "text", text: message.button?.text };
  }

  // Unsupported kinds (reaction, order, unknown…) keep the raw payload (RF-090).
  return { ...base, contentType: "unknown" };
}
