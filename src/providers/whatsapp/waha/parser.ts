/**
 * WAHA webhook `message`/`message.any` event parser. Payload shape (WAHA
 * docs, "Receive messages"/"Events"):
 *   { id, timestamp, from, fromMe, to, body, hasMedia, media?: {url, mimetype, filename, error}, ack }
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

import type { IInboundMessage, InboundContentType, IOutboundEcho } from "../types";

const NON_INDIVIDUAL_JID = /@(g\.us|broadcast|newsletter)$/;
const LID_JID = /@lid$/;

function jidToE164(jid: string | undefined): string {
  const digits = (jid ?? "").split("@")[0]?.replace(/\D/g, "") ?? "";
  return digits.length > 0 ? `+${digits}` : "";
}

interface IWahaMedia {
  url?: string;
  mimetype?: string;
  filename?: string | null;
  error?: string | null;
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
}

function tsToIso(value: number | undefined): string {
  return typeof value === "number" && value > 0
    ? new Date(value * 1000).toISOString()
    : new Date().toISOString();
}

function contentTypeFromMimetype(mimetype: string | undefined): InboundContentType {
  if (!mimetype) return "unknown";
  if (mimetype.startsWith("image/")) return "image";
  if (mimetype.startsWith("audio/")) return "audio";
  if (mimetype.startsWith("video/")) return "video";
  return "document";
}

interface IParsedContent {
  contentType: InboundContentType;
  text?: string;
  mediaId?: string;
  mediaFilename?: string;
}

function extractContent(payload: IWahaMessagePayload): IParsedContent {
  if (payload.hasMedia && payload.media?.url) {
    return {
      contentType: contentTypeFromMimetype(payload.media.mimetype),
      text: payload.body || undefined,
      mediaId: payload.media.url,
      mediaFilename: payload.media.filename ?? undefined,
    };
  }
  return { contentType: "text", text: payload.body ?? "" };
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
    timestamp,
    rawPayload,
  };
}
