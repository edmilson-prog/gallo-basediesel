/**
 * WAHA webhook `message`/`message.any` event parser. Payload shape (WAHA
 * docs, "Receive messages"/"Events"):
 *   { id, timestamp, from, fromMe, to, body, hasMedia, media?: {url, mimetype, filename, error}, vCards?: string[], ack }
 * `from` is always the CHAT's JID (`<digits>@c.us` for 1:1) regardless of
 * direction — for a genuine inbound message that's the sender, but for an
 * outbound echo (`fromMe: true`, delivered only via `message.any` — see
 * WAHA_DEFAULT_EVENTS) it's the RECIPIENT. `to` is not populated on real
 * `message.any` payloads (confirmed empirically: WAHA 2026.6.2 sends
 * `to: null` on every `fromMe:true` envelope) — never read for the
 * recipient. Groups (`@g.us`), broadcasts and newsletters are rejected (no
 * 1:1 customer to attach the message to). A chat party with WhatsApp's
 * privacy setting enabled arrives as `<digits>@lid` instead of `@c.us` —
 * still 1:1, but the digits are NOT a phone number. Those are surfaced via
 * `fromLid` / `toLid` (with `fromPhone` / `toPhone` empty) for the webhook
 * to resolve before customer matching.
 * `session.status` events are handled directly by the Edge Function, not by
 * this parser (they update `whatsapp_accounts.status`, not a message row).
 */

import type { IInboundMessage, InboundContentType, IOutboundEcho, IAdReferral } from "../types";
import { encodeContact, encodeLocation, nameFromVCard, phoneFromVCard } from "../contentFormat";

const NON_INDIVIDUAL_JID = /@(g\.us|broadcast|newsletter)$/;
const LID_JID = /@lid$/;

export function jidToE164(jid: string | undefined): string {
  const digits = (jid ?? "").split("@")[0]?.replace(/\D/g, "") ?? "";
  return digits.length > 0 ? `+${digits}` : "";
}

interface IWahaMedia {
  url?: string;
  mimetype?: string;
  filename?: string | null;
  error?: string | null;
}

/** Mirrors whatsmeow's ContextInfo_ExternalAdReplyInfo casing (same library
 *  as Evolution-Go — see IGoExternalAdReplyInfo). NOT confirmed against a
 *  real WAHA payload (see Task 4 in the ad-source-detection plan). `mediaType`
 *  may arrive as the confirmed whatsmeow integer enum (0/1/2) or as a string
 *  — normalized defensively below. */
interface IWahaExternalAdReplyInfo {
  title?: string;
  body?: string;
  sourceID?: string;
  sourceType?: string;
  sourceURL?: string;
  mediaType?: number | string;
  mediaURL?: string;
  ctwaClid?: string;
}
/** `remoteJID: "status@broadcast"` is whatsmeow's marker that this message
 *  quotes a WhatsApp Status update rather than a message in the chat itself
 *  (confirmed against a real WAHA capture, 2026-07-20 — see isWahaStatusReply). */
interface IWahaContextInfo {
  externalAdReply?: IWahaExternalAdReplyInfo;
  remoteJID?: string;
}
/** A WhatsApp "template" broadcast. The readable body lives under one of three
 *  shapes depending on how the sender built it — all three confirmed against
 *  real captures (2026-07-20/21); each carries genuine text that is present
 *  NOWHERE else in the payload (`body` arrives null). */
interface IWahaTemplateMessage {
  Format?: {
    InteractiveMessageTemplate?: { body?: { text?: string } };
    HydratedFourRowTemplate?: { hydratedContentText?: string };
  };
  hydratedTemplate?: { hydratedContentText?: string };
}

interface IWahaGoMessageBody {
  extendedTextMessage?: { contextInfo?: IWahaContextInfo };
  imageMessage?: { contextInfo?: IWahaContextInfo };
  videoMessage?: { contextInfo?: IWahaContextInfo };
  templateMessage?: IWahaTemplateMessage;
  /** Any other whatsmeow message kind (albumMessage, protocolMessage,
   *  interactiveMessage, …). Not modelled individually — the index signature
   *  exists so {@link wahaMessageKind} can NAME an unhandled kind when
   *  rejecting it, which keeps future WhatsApp types diagnosable from the
   *  webhook log instead of silently becoming blank rows. */
  [kind: string]: unknown;
}

/** The quoted message WAHA renders a `replyTo` for — confirmed shape (real
 *  capture, 2026-07-20): media is already downloaded/re-hosted by the WAHA
 *  server itself (mms3 CDN URL decrypted server-side), so it downloads the
 *  same way as `IWahaMessagePayload.media` — no WhatsApp media-key decryption
 *  needed here. */
interface IWahaReplyTo {
  id?: string;
  body?: string;
  hasMedia?: boolean;
  media?: IWahaMedia | null;
  participant?: string;
}

/** A shared location pin. WAHA sends the coordinates as STRINGS (confirmed
 *  capture, 2026-07-21) — `latitude: "-27.393307"` — so they must be parsed,
 *  never trusted as numbers. */
interface IWahaLocation {
  latitude?: string | number;
  longitude?: string | number;
  name?: string;
  address?: string;
}

export interface IWahaMessagePayload {
  id?: string;
  timestamp?: number;
  from?: string;
  fromMe?: boolean;
  to?: string;
  body?: string;
  hasMedia?: boolean;
  media?: IWahaMedia | null;
  /** Present (null on most messages) when the sender shared a location pin. */
  location?: IWahaLocation | null;
  /** Present (possibly empty) on every WAHA message payload; non-empty when
   *  the sender shared one or more contact cards. Only the first is used —
   *  see extractContent. */
  vCards?: string[];
  /** Set when this message quotes another one (in-chat reply OR a Status
   *  comment) — see isWahaStatusReply/extractContent. */
  replyTo?: IWahaReplyTo | null;
  /** HYPOTHESIZED: WAHA's GOWS engine wraps whatsmeow directly, so the raw
   *  engine message (when WAHA exposes it) should mirror IGoMessageBody
   *  nested under `_data.Message`. Unconfirmed — extractWahaAdReferral
   *  degrades to undefined when this path is absent, so a wrong guess can
   *  never break message parsing itself. */
  _data?: { Message?: IWahaGoMessageBody };
}

/** Whether this message is a reply/comment on a WhatsApp Status update
 *  (as opposed to a quoted reply to a message in the chat itself). See
 *  IWahaContextInfo doc — confirmed against a real WAHA capture. */
export function isWahaStatusReply(payload: IWahaMessagePayload): boolean {
  const msg = payload._data?.Message;
  const contextInfo =
    msg?.extendedTextMessage?.contextInfo ??
    msg?.imageMessage?.contextInfo ??
    msg?.videoMessage?.contextInfo;
  return contextInfo?.remoteJID === "status@broadcast";
}

function tsToIso(value: number | undefined): string {
  return typeof value === "number" && value > 0
    ? new Date(value * 1000).toISOString()
    : new Date().toISOString();
}

export function contentTypeFromMimetype(mimetype: string | undefined): InboundContentType {
  if (!mimetype) return "unknown";
  if (mimetype.startsWith("image/")) return "image";
  if (mimetype.startsWith("audio/")) return "audio";
  if (mimetype.startsWith("video/")) return "video";
  return "document";
}

export interface IParsedContent {
  contentType: InboundContentType;
  text?: string;
  mediaId?: string;
  mediaFilename?: string;
}

/**
 * A coordinate WAHA sent as a string (or, defensively, a number). Rejects the
 * empty string explicitly: `Number("")` is `0`, which would silently place a
 * failed parse in the Gulf of Guinea instead of discarding it.
 */
function toCoord(value: string | number | undefined): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Canonical location text, or undefined when the pin carries nothing usable
 *  (no coordinates and no label) — the caller then falls through to the
 *  content guard rather than storing an empty location row. */
function extractWahaLocationText(payload: IWahaMessagePayload): string | undefined {
  const location = payload.location;
  if (!location) return undefined;
  return (
    encodeLocation({
      name: location.name || location.address,
      lat: toCoord(location.latitude),
      lng: toCoord(location.longitude),
    }) || undefined
  );
}

/** Readable body of a template broadcast — see IWahaTemplateMessage for why
 *  three shapes are probed. */
function extractWahaTemplateText(payload: IWahaMessagePayload): string | undefined {
  const template = payload._data?.Message?.templateMessage;
  if (!template) return undefined;
  const text =
    template.Format?.InteractiveMessageTemplate?.body?.text ??
    template.Format?.HydratedFourRowTemplate?.hydratedContentText ??
    template.hydratedTemplate?.hydratedContentText;
  return text?.trim() ? text : undefined;
}

/** Name of the raw whatsmeow message kind (e.g. "albumMessage"), used only to
 *  explain a rejection. `messageContextInfo` rides along on most envelopes and
 *  never identifies the message, so it is skipped. */
export function wahaMessageKind(payload: IWahaMessagePayload): string | undefined {
  const message = payload._data?.Message;
  if (!message) return undefined;
  return Object.keys(message).find((key) => key !== "messageContextInfo");
}

export function extractContent(payload: IWahaMessagePayload): IParsedContent {
  if (payload.hasMedia && payload.media?.url) {
    return {
      contentType: contentTypeFromMimetype(payload.media.mimetype),
      text: payload.body || undefined,
      mediaId: payload.media.url,
      mediaFilename: payload.media.filename ?? undefined,
    };
  }
  // A comment on a WhatsApp Status quotes media that lives OUTSIDE any
  // conversation — we never see the status itself, only this reply. Without
  // pulling the quoted image/video in here it's lost forever, so it becomes
  // THIS message's own media and the customer's comment stays as its text
  // (same shape as a normal image+caption inbound).
  if (isWahaStatusReply(payload) && payload.replyTo?.hasMedia && payload.replyTo.media?.url) {
    return {
      contentType: contentTypeFromMimetype(payload.replyTo.media.mimetype),
      text: payload.body || undefined,
      mediaId: payload.replyTo.media.url,
    };
  }
  // WAHA reports hasMedia:true but no `url` when ITS OWN download of the media
  // failed upstream (non-retriable 403 on an expired WhatsApp CDN link). The
  // bytes are gone, but the message still happened — keep the content type so
  // the thread renders an "unavailable media" bubble instead of a blank one.
  if (payload.hasMedia && payload.media?.mimetype) {
    return {
      contentType: contentTypeFromMimetype(payload.media.mimetype),
      text: payload.body || undefined,
      mediaFilename: payload.media.filename ?? undefined,
    };
  }
  if (payload.vCards?.[0]) {
    const vcard = payload.vCards[0];
    return {
      contentType: "contact",
      text: encodeContact({ name: nameFromVCard(vcard), phone: phoneFromVCard(vcard) }),
    };
  }
  const locationText = extractWahaLocationText(payload);
  if (locationText) {
    return { contentType: "location", text: locationText };
  }
  // Template broadcasts carry their text ONLY inside `_data` — `body` is null.
  const templateText = extractWahaTemplateText(payload);
  if (templateText) {
    return { contentType: "text", text: templateText };
  }
  return { contentType: "text", text: payload.body ?? "" };
}

function normalizeWahaAdMediaType(value: number | string | undefined): "image" | "video" | undefined {
  if (value === 1 || value === "IMAGE") return "image";
  if (value === 2 || value === "VIDEO") return "video";
  if (typeof value === "string") {
    const v = value.toUpperCase();
    if (v.includes("IMAGE")) return "image";
    if (v.includes("VIDEO")) return "video";
  }
  return undefined;
}

/** See IWahaMessagePayload._data doc — hypothesized shape, not confirmed.
 *  Property key is `externalAdReply` (confirmed on whatsmeow's own
 *  ContextInfo — the `ExternalAdReplyInfo` suffix names only the TYPE, see
 *  Task 2's extractGoAdReferral). */
export function extractWahaAdReferral(payload: IWahaMessagePayload): IAdReferral | undefined {
  const msg = payload._data?.Message;
  const info =
    msg?.extendedTextMessage?.contextInfo?.externalAdReply ??
    msg?.imageMessage?.contextInfo?.externalAdReply ??
    msg?.videoMessage?.contextInfo?.externalAdReply;
  if (!info) return undefined;
  return {
    sourceId: info.sourceID,
    sourceUrl: info.sourceURL,
    sourceType: info.sourceType,
    headline: info.title,
    body: info.body,
    mediaType: normalizeWahaAdMediaType(info.mediaType),
    mediaUrl: info.mediaURL,
  };
}

export function parseWahaMessageEvent(
  rawPayload: unknown,
  accountId: string,
): IInboundMessage | IOutboundEcho {
  const payload = rawPayload as IWahaMessagePayload | null;
  if (!payload?.id) {
    throw new Error("WahaProvider: payload de mensagem irreconhecível (sem 'id')");
  }
  // `from` is the chat JID on BOTH directions — see file header. `to` is
  // never populated on real fromMe:true payloads, so it's never read here.
  const chat = payload.from;
  if (NON_INDIVIDUAL_JID.test(chat ?? "")) {
    throw new Error("WahaProvider: mensagem de grupo/broadcast/newsletter — ignorar");
  }

  const content = extractContent(payload);
  // Content guard. WhatsApp delivers plenty of envelopes that are pure
  // protocol — album headers announcing sibling media, button-only interactive
  // messages, e2e notifications — and every one of them used to be persisted
  // as a row with no text and no media, surfacing as a blank bubble in the
  // thread (~24% of conversations carried at least one). A real message can
  // never be text-typed AND empty: WhatsApp rejects blank sends. Rejecting
  // here reuses the parser's existing throw contract, so the webhook records
  // the drop as `outcome: "ignored"` with this reason instead of writing.
  if (content.contentType === "text" && !content.text?.trim()) {
    const kind = wahaMessageKind(payload);
    throw new Error(`WahaProvider: envelope sem conteúdo${kind ? ` (${kind})` : ""} — ignorar`);
  }
  const timestamp = tsToIso(payload.timestamp);

  if (payload.fromMe) {
    return {
      type: "outbound-echo",
      providerMessageId: payload.id,
      // The recipient is `from` here (see file header — `to` is null on
      // real fromMe:true payloads). Same @lid caveat as the inbound side,
      // but on the destination: a recipient behind WhatsApp's privacy
      // setting arrives as `<digits>@lid` — never fabricate a phone from
      // those digits.
      toPhone: LID_JID.test(payload.from ?? "") ? "" : jidToE164(payload.from),
      toLid: LID_JID.test(payload.from ?? "") ? payload.from : undefined,
      contentType: content.contentType,
      text: content.text,
      mediaId: content.mediaId,
      mediaFilename: content.mediaFilename,
      timestamp,
      rawPayload,
    };
  }

  return {
    type: "message",
    providerMessageId: payload.id,
    // A sender behind WhatsApp's privacy setting arrives as `<digits>@lid` —
    // NOT a phone. Blindly converting those digits fabricates an impossible
    // "+phone", so surface the raw lid instead and let the webhook resolve it.
    fromPhone: LID_JID.test(payload.from ?? "") ? "" : jidToE164(payload.from),
    fromLid: LID_JID.test(payload.from ?? "") ? payload.from : undefined,
    // WAHA resolves the account by sessionName (webhook envelope), not by phone.
    toAccountPhone: "",
    accountId,
    contentType: content.contentType,
    text: content.text,
    mediaId: content.mediaId,
    mediaFilename: content.mediaFilename,
    adReferral: extractWahaAdReferral(payload),
    timestamp,
    rawPayload,
  };
}
