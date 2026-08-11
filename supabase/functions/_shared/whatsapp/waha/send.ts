// AUTO-GENERATED MIRROR — DO NOT EDIT.
// Source: src/providers/whatsapp/waha/send.ts (sync: bun run scripts/sync-whatsapp-shared.ts)

/** WAHA outbound send — text (`/api/sendText`) and media (`/api/sendImage`/`/api/sendVoice`/`/api/sendVideo`/`/api/sendFile`). */

import { WhatsAppProviderError } from "../errors.ts";
import { wahaRequest } from "./client.ts";
import type { IWahaSessionTarget } from "./session.ts";
import { normalizeBrDialDigits } from "../phoneBr.ts";

export interface IWahaSendResult {
  providerMessageId: string;
}

function toChatId(phone: string): string {
  // customers.phone may be a bare BR local number (DINTEC import wrote ERP
  // values verbatim) — without the DDI the JID resolves to the wrong country.
  return `${normalizeBrDialDigits(phone)}@c.us`;
}

/**
 * Extracts the chat JID from a WAHA serialized message id
 * (`{fromMe}_{chatJid}_{hash}`) — either lid-addressed (`<digits>@lid`,
 * WhatsApp's privacy identifier) or phone-addressed (`<digits>@c.us`).
 * Returns null for group chats (`@g.us`) and malformed input.
 *
 * This is the address WhatsApp itself uses for the chat, so it is the truth
 * about WHO is on the other side — unlike the registry phone, which is a CRM
 * field that can hold a different number entirely (2026-08-11: a conversation
 * with a buyer's mobile was re-anchored onto his company's customer record by
 * `reanchor_converted_lead_conversations`, whose DINTEC-imported phone is the
 * company LANDLINE; every reply then dialled a number with no WhatsApp and
 * came back as an opaque GOWS 500).
 */
export function extractChatJid(providerMessageId: string): string | null {
  const chatJid = providerMessageId.split("_")[1] ?? "";
  return /^\d+@(?:lid|c\.us)$/.test(chatJid) ? chatJid : null;
}

/**
 * True when WAHA answered REJECTING the send — i.e. the message definitely did
 * not go out, so re-dispatching it to a different address is safe.
 *
 * Deliberately narrow. `wahaRequest` only raises `WhatsAppProviderError` after
 * the server replied with a non-2xx; a timeout/abort surfaces as a plain
 * DOMException/Error and must NEVER be retried — WAHA keeps working after we
 * hang up, so the message may well have been delivered (same reasoning as
 * MEDIA_TIMEOUT_MS above). Session-level codes are excluded too: a different
 * recipient cannot fix a bad API key, a rate limit or a missing session.
 */
export function isRecipientRejection(err: unknown): boolean {
  return (
    err instanceof WhatsAppProviderError &&
    (err.code === "INTEGRATION_ERROR" || err.code === "CUSTOMER_INVALID_WHATSAPP")
  );
}

function extractMessageId(body: unknown): string {
  const b = body as { id?: string } | null;
  if (!b?.id) {
    throw new WhatsAppProviderError(
      "INTEGRATION_ERROR",
      502,
      "Resposta do WAHA sem id de mensagem",
    );
  }
  return b.id;
}

export async function sendWahaText(
  apiKey: string,
  fetchFn: typeof fetch,
  target: IWahaSessionTarget,
  input: {
    toPhone: string;
    text: string;
    /** Verbatim chat JID (e.g. `123@lid`) — bypasses the phone→chatId derivation. */
    chatId?: string;
    /** SERIALIZED provider id of the quoted message (`messages.provider_message_id`). */
    replyTo?: string;
  },
): Promise<IWahaSendResult> {
  const response = await wahaRequest(apiKey, fetchFn, {
    baseUrl: target.baseUrl,
    path: "/api/sendText",
    json: {
      session: target.sessionName,
      chatId: input.chatId ?? toChatId(input.toPhone),
      text: input.text,
      ...(input.replyTo ? { reply_to: input.replyTo } : {}),
    },
  });
  return { providerMessageId: extractMessageId(response.body) };
}

export interface IWahaSendMediaInput {
  toPhone: string;
  /** Verbatim chat JID (e.g. `123@lid`) — bypasses the phone→chatId derivation. */
  chatId?: string;
  mediaType: "image" | "audio" | "video" | "document";
  /** Publicly fetchable URL (e.g. a short-lived signed URL from whatsapp-media). */
  mediaUrl: string;
  mimetype?: string;
  caption?: string;
  filename?: string;
  /** Byte size of the file — decides whether a video goes inline or as a document. */
  sizeBytes?: number;
  /** SERIALIZED provider id of the quoted message (`messages.provider_message_id`). */
  replyTo?: string;
}

const MEDIA_ENDPOINTS: Record<IWahaSendMediaInput["mediaType"], string> = {
  image: "/api/sendImage",
  audio: "/api/sendVoice",
  video: "/api/sendFile",
  document: "/api/sendFile",
};

/**
 * WhatsApp only renders a video as an inline, playable bubble (thumbnail +
 * play) up to 16 MB — that path is `/api/sendVideo`. A larger video has to go
 * as a document (`/api/sendFile`), which the recipient downloads instead of
 * playing in place. So a video routes by size: inline when it fits, document
 * otherwise. Matches WhatsApp's own gallery-media ceiling.
 */
const INLINE_VIDEO_MAX_BYTES = 16 * 1024 * 1024;

/**
 * Media sends need more headroom than the 15s default: WAHA fetches the signed
 * URL and re-uploads the bytes to WhatsApp synchronously before it answers, so
 * the clock covers two full transfers of the file. At the 25 MiB bucket
 * ceiling 15s is not enough, and aborting early is worse than waiting — WAHA
 * keeps going after we hang up, so the message can be delivered while we
 * record it as failed.
 *
 * Capped at 60s rather than something larger because this same function backs
 * the scheduled-send worker, which walks a batch of up to 50 rows in sequence
 * inside one Edge invocation. One slow item must not eat the whole execution
 * window and strand the rest of the batch.
 */
const MEDIA_TIMEOUT_MS = 60_000;

/** Posts one media message to a specific WAHA endpoint. */
async function postWahaMedia(
  apiKey: string,
  fetchFn: typeof fetch,
  target: IWahaSessionTarget,
  input: IWahaSendMediaInput,
  path: string,
  asInlineVideo: boolean,
): Promise<IWahaSendResult> {
  // Audio goes through /api/sendVoice (not /api/sendFile) so WhatsApp renders
  // a native playable voice-note bubble instead of a downloadable document —
  // `convert: true` lets WAHA transcode the source (e.g. our recorder's
  // webm/opus) into the OGG/Opus container WhatsApp requires. WAHA voice
  // notes carry no caption, so it's never sent on this endpoint.
  const isVoice = input.mediaType === "audio";
  const response = await wahaRequest(apiKey, fetchFn, {
    baseUrl: target.baseUrl,
    path,
    timeoutMs: MEDIA_TIMEOUT_MS,
    json: {
      session: target.sessionName,
      chatId: input.chatId ?? toChatId(input.toPhone),
      file: {
        // sendVideo needs the mimetype to route to the inline video bubble;
        // default to video/mp4 when the caller didn't carry one through.
        mimetype: asInlineVideo ? (input.mimetype ?? "video/mp4") : input.mimetype,
        url: input.mediaUrl,
        filename: input.filename,
      },
      ...(input.caption && !isVoice ? { caption: input.caption } : {}),
      ...(isVoice || asInlineVideo ? { convert: true } : {}),
      ...(input.replyTo ? { reply_to: input.replyTo } : {}),
    },
  });
  return { providerMessageId: extractMessageId(response.body) };
}

export async function sendWahaMedia(
  apiKey: string,
  fetchFn: typeof fetch,
  target: IWahaSessionTarget,
  input: IWahaSendMediaInput,
): Promise<IWahaSendResult> {
  // A video small enough for WhatsApp's inline limit goes through
  // /api/sendVideo so it plays in the conversation; `convert: true` lets WAHA
  // normalise odd codecs (e.g. HEVC) to the mp4/h264 WhatsApp needs. Anything
  // larger goes as a document.
  const asInlineVideo =
    input.mediaType === "video" &&
    input.sizeBytes !== undefined &&
    input.sizeBytes <= INLINE_VIDEO_MAX_BYTES;

  if (asInlineVideo) {
    try {
      return await postWahaMedia(apiKey, fetchFn, target, input, "/api/sendVideo", true);
    } catch (err) {
      // If WAHA rejected the request outright — e.g. the running engine has no
      // /api/sendVideo — fall back to the document endpoint so the video still
      // goes out (as a file). A WhatsAppProviderError means WAHA answered a
      // non-2xx, i.e. it did NOT send; a timeout/abort or network error is
      // rethrown, because WAHA may have sent it and a retry would duplicate.
      if (!(err instanceof WhatsAppProviderError)) throw err;
    }
  }

  return postWahaMedia(apiKey, fetchFn, target, input, MEDIA_ENDPOINTS[input.mediaType], false);
}
