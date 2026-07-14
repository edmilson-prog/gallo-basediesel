// AUTO-GENERATED MIRROR — DO NOT EDIT.
// Source: src/providers/whatsapp/evolution-go/parser.ts (sync: bun run scripts/sync-whatsapp-shared.ts)

/**
 * Evolution Go (whatsmeow) webhook parser. Events are PascalCase:
 * - `Message` + Info.IsFromMe=false → inbound message;
 * - `Message` + Info.IsFromMe=true  → outbound echo (mirrored by the webhook);
 * - `SendMessage` → own sends emitted by the Go server for phone/companion-sent
 *   messages (evidence: integration_logs 2026-06-30 — IsFromMe always true; API
 *   sends do NOT emit it); same payload shape as `Message`, parsed identically;
 * - `Receipt` (state Delivered/Read, or data.Type) → delivery status.
 * Group/broadcast/newsletter/@lid chats throw (no 1:1 customer). `Connection`
 * and any other event throw — the webhook core handles connection lifecycle.
 */

import { toE164 } from "../phone.ts";
import { encodeBaileysContact, encodeBaileysLocation } from "../contentFormat.ts";
import { encodeGoMediaRef, type GoMediaMessageKey } from "./media.ts";
import type { IInboundMessage, IInboundStatus, InboundContentType, IOutboundEcho, IAdReferral } from "../types.ts";

interface IGoInfo {
  Chat?: string;
  Sender?: string;
  IsFromMe?: boolean;
  Type?: string;
  PushName?: string;
  ID?: string;
  Timestamp?: string | number;
}

interface IGoMediaNode {
  caption?: string;
  mimetype?: string;
  url?: string;
  directPath?: string;
  mediaKey?: string;
  fileEncSHA256?: string;
  fileSHA256?: string;
  fileLength?: number;
}

interface IGoLocationNode {
  degreesLatitude?: number;
  degreesLongitude?: number;
  name?: string;
  address?: string;
}

interface IGoContactNode {
  displayName?: string;
  vcard?: string;
}

/** whatsmeow `ContextInfo_ExternalAdReplyInfo` (docs/integracoes/evo-go/doc.json) —
 *  `mediaType` is a Swagger INTEGER enum (0=NONE, 1=IMAGE, 2=VIDEO) per the
 *  confirmed schema, but string variants (bare "IMAGE" or the full enum name)
 *  are also normalized defensively — extraction below never calls a string
 *  method on the raw value without a typeof guard. */
interface IGoExternalAdReplyInfo {
  title?: string;
  body?: string;
  sourceID?: string;
  sourceType?: string;
  sourceURL?: string;
  mediaType?: number | string;
  mediaURL?: string;
  ctwaClid?: string;
}

interface IGoContextInfo {
  externalAdReply?: IGoExternalAdReplyInfo;
}

export interface IGoMessageBody {
  conversation?: string;
  extendedTextMessage?: { text?: string; contextInfo?: IGoContextInfo };
  imageMessage?: IGoMediaNode & { contextInfo?: IGoContextInfo };
  audioMessage?: IGoMediaNode;
  videoMessage?: IGoMediaNode & { contextInfo?: IGoContextInfo };
  documentMessage?: IGoMediaNode & { fileName?: string };
  locationMessage?: IGoLocationNode;
  contactMessage?: IGoContactNode;
  contactsArrayMessage?: { contacts?: IGoContactNode[] };
}

interface IGoEvent {
  event?: string;
  state?: string;
  instanceId?: string;
  data?: {
    Info?: IGoInfo;
    Message?: IGoMessageBody;
    MessageIDs?: string[];
    Type?: string;
    Timestamp?: string | number;
  };
}

const NON_INDIVIDUAL_JID = /@(g\.us|broadcast|newsletter|lid)$/;

export function jidToE164(jid: string | undefined): string {
  if (!jid) return "";
  return toE164(jid.split("@")[0]?.split(":")[0] ?? "");
}

export function tsToIso(value: string | number | undefined): string {
  if (typeof value === "string" && value.length > 0) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : new Date().toISOString();
}

/**
 * Serialize the media sub-node VERBATIM under its proto key, so the download
 * call can POST it back as `{ message: { <key>: <node> } }`. Forwarding the raw
 * node (not a re-picked subset) preserves every field whatsmeow needs to
 * re-download — mediaKey / fileEncSHA256 / fileSHA256 / directPath / fileLength.
 */
function mediaRefFrom(key: GoMediaMessageKey, node: IGoMediaNode): string {
  return encodeGoMediaRef({ [key]: node });
}

export interface IGoContent {
  contentType: InboundContentType;
  text?: string;
  mediaCaption?: string;
  mediaId?: string;
  /** documentMessage.fileName — the original document name. */
  mediaFilename?: string;
}

export function extractContent(msg: IGoMessageBody): IGoContent {
  if (msg.conversation !== undefined || msg.extendedTextMessage) {
    return { contentType: "text", text: msg.conversation ?? msg.extendedTextMessage?.text };
  }
  if (msg.imageMessage)
    return { contentType: "image", mediaCaption: msg.imageMessage.caption, mediaId: mediaRefFrom("imageMessage", msg.imageMessage) };
  if (msg.audioMessage) return { contentType: "audio", mediaId: mediaRefFrom("audioMessage", msg.audioMessage) };
  if (msg.videoMessage)
    return { contentType: "video", mediaCaption: msg.videoMessage.caption, mediaId: mediaRefFrom("videoMessage", msg.videoMessage) };
  if (msg.documentMessage)
    return {
      contentType: "document",
      mediaCaption: msg.documentMessage.caption,
      mediaId: mediaRefFrom("documentMessage", msg.documentMessage),
      mediaFilename: msg.documentMessage.fileName,
    };
  if (msg.locationMessage) {
    return { contentType: "location", text: encodeBaileysLocation(msg.locationMessage) };
  }
  const contactNode = msg.contactMessage ?? msg.contactsArrayMessage?.contacts?.[0];
  if (contactNode) {
    return { contentType: "contact", text: encodeBaileysContact(contactNode) };
  }
  return { contentType: "unknown" };
}

function normalizeGoAdMediaType(value: number | string | undefined): "image" | "video" | undefined {
  if (value === 1 || value === "IMAGE") return "image";
  if (value === 2 || value === "VIDEO") return "video";
  if (typeof value === "string") {
    const v = value.toUpperCase();
    if (v.includes("IMAGE")) return "image";
    if (v.includes("VIDEO")) return "video";
  }
  return undefined;
}

/** whatsmeow shape confirmed via docs/integracoes/evo-go/doc.json. Returns
 *  undefined (never throws) whenever externalAdReply is absent/malformed. */
export function extractGoAdReferral(msg: IGoMessageBody): IAdReferral | undefined {
  const info =
    msg.extendedTextMessage?.contextInfo?.externalAdReply ??
    msg.imageMessage?.contextInfo?.externalAdReply ??
    msg.videoMessage?.contextInfo?.externalAdReply;
  if (!info) return undefined;
  return {
    sourceId: info.sourceID,
    sourceUrl: info.sourceURL,
    sourceType: info.sourceType,
    headline: info.title,
    body: info.body,
    mediaType: normalizeGoAdMediaType(info.mediaType),
    mediaUrl: info.mediaURL,
  };
}

const RECEIPT_STATUS_MAP: Record<string, IInboundStatus["status"]> = {
  delivered: "delivered",
  read: "read",
  readself: "read",
};

export function parseEvolutionGoInbound(
  rawPayload: unknown,
  accountId: string,
): IInboundMessage | IInboundStatus | IOutboundEcho {
  const ev = rawPayload as IGoEvent | null;
  if (!ev?.event) {
    throw new Error("EvolutionGoProvider: payload de webhook irreconhecível (sem 'event')");
  }

  if (ev.event === "Receipt") {
    const raw = String(ev.state ?? ev.data?.Type ?? "").toLowerCase();
    const status = RECEIPT_STATUS_MAP[raw];
    const id = ev.data?.MessageIDs?.[0] ?? "";
    if (!status) {
      throw new Error(`EvolutionGoProvider: Receipt com estado desconhecido: ${ev.state ?? ev.data?.Type}`);
    }
    if (!id) {
      throw new Error("EvolutionGoProvider: Receipt sem MessageID");
    }
    return {
      type: "status",
      providerMessageId: id,
      status,
      timestamp: tsToIso(ev.data?.Timestamp),
      rawPayload,
    };
  }

  // `Message` = messages from others; `SendMessage` = own sends emitted by the
  // Go server for phone/companion-sent messages (evidence: integration_logs
  // 2026-06-30 — IsFromMe always true; API sends do NOT emit it). Same payload
  // shape, so both flow through the same parsing below.
  if (ev.event !== "Message" && ev.event !== "SendMessage") {
    throw new Error(`EvolutionGoProvider: evento não suportado pelo parser: ${ev.event}`);
  }

  const info = ev.data?.Info ?? {};
  const chat = info.Chat ?? "";
  if (NON_INDIVIDUAL_JID.test(chat)) {
    throw new Error("EvolutionGoProvider: Message de grupo/broadcast/newsletter/@lid — ignorar");
  }

  const content = extractContent(ev.data?.Message ?? {});
  const timestamp = tsToIso(info.Timestamp);

  if (info.IsFromMe) {
    return {
      type: "outbound-echo",
      providerMessageId: info.ID ?? "",
      toPhone: jidToE164(chat),
      contentType: content.contentType,
      text: content.text,
      // Verbatim proto ref (same encode as inbound) so downloadInboundMedia can
      // re-fetch and mirror phone-sent media into storage (spec 2026-07-02).
      mediaId: content.mediaId,
      mediaCaption: content.mediaCaption,
      mediaFilename: content.mediaFilename,
      timestamp,
      rawPayload,
    };
  }

  return {
    type: "message",
    providerMessageId: info.ID ?? "",
    fromPhone: jidToE164(info.Sender ?? chat),
    // Go resolves the account by instanceId (webhook core), not by phone.
    toAccountPhone: "",
    accountId,
    contentType: content.contentType,
    text: content.text,
    mediaId: content.mediaId,
    mediaCaption: content.mediaCaption,
    mediaFilename: content.mediaFilename,
    senderName: info.PushName,
    adReferral: extractGoAdReferral(ev.data?.Message ?? {}),
    timestamp,
    rawPayload,
  };
}
