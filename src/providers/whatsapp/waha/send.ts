/** WAHA outbound send — text (`/api/sendText`) and media (`/api/sendImage`/`/api/sendVoice`/`/api/sendFile`). */

import { WhatsAppProviderError } from "../errors";
import { wahaRequest } from "./client";
import type { IWahaSessionTarget } from "./session";
import { normalizeBrDialDigits } from "../phoneBr";

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
 * (`{fromMe}_{chatJid}_{hash}`) when the chat is lid-addressed
 * (`<digits>@lid` — WhatsApp privacy identifier). Returns null for
 * phone (`@c.us`) and group (`@g.us`) chats or malformed input — callers
 * treat that as "no lid address available". Used as the last-resort
 * recipient for conversations whose contact has no resolvable phone.
 */
export function extractLidChatId(providerMessageId: string): string | null {
  const chatJid = providerMessageId.split("_")[1] ?? "";
  return /^\d+@lid$/.test(chatJid) ? chatJid : null;
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
  },
): Promise<IWahaSendResult> {
  const response = await wahaRequest(apiKey, fetchFn, {
    baseUrl: target.baseUrl,
    path: "/api/sendText",
    json: {
      session: target.sessionName,
      chatId: input.chatId ?? toChatId(input.toPhone),
      text: input.text,
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
}

const MEDIA_ENDPOINTS: Record<IWahaSendMediaInput["mediaType"], string> = {
  image: "/api/sendImage",
  audio: "/api/sendVoice",
  video: "/api/sendFile",
  document: "/api/sendFile",
};

/**
 * Media sends need far more headroom than the 15s default: WAHA fetches the
 * signed URL and re-uploads the bytes to WhatsApp synchronously before it
 * answers, so the clock covers two full transfers of the file. At the 25 MiB
 * bucket ceiling, 15s is not enough on an ordinary connection and the send
 * aborts mid-transfer — the message just lands as failed.
 */
const MEDIA_TIMEOUT_MS = 120_000;

export async function sendWahaMedia(
  apiKey: string,
  fetchFn: typeof fetch,
  target: IWahaSessionTarget,
  input: IWahaSendMediaInput,
): Promise<IWahaSendResult> {
  // Audio goes through /api/sendVoice (not /api/sendFile) so WhatsApp renders
  // a native playable voice-note bubble instead of a downloadable document —
  // `convert: true` lets WAHA transcode the source (e.g. our recorder's
  // webm/opus) into the OGG/Opus container WhatsApp requires. WAHA voice
  // notes carry no caption, so it's never sent on this endpoint.
  const isVoice = input.mediaType === "audio";
  const response = await wahaRequest(apiKey, fetchFn, {
    baseUrl: target.baseUrl,
    path: MEDIA_ENDPOINTS[input.mediaType],
    timeoutMs: MEDIA_TIMEOUT_MS,
    json: {
      session: target.sessionName,
      chatId: input.chatId ?? toChatId(input.toPhone),
      file: { mimetype: input.mimetype, url: input.mediaUrl, filename: input.filename },
      ...(input.caption && !isVoice ? { caption: input.caption } : {}),
      ...(isVoice ? { convert: true } : {}),
    },
  });
  return { providerMessageId: extractMessageId(response.body) };
}
