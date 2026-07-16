/** WAHA outbound send — text (`/api/sendText`) and media (`/api/sendImage`/`/api/sendVoice`/`/api/sendFile`). */

import { WhatsAppProviderError } from "../errors";
import { wahaRequest } from "./client";
import type { IWahaSessionTarget } from "./session";

export interface IWahaSendResult {
  providerMessageId: string;
}

function toChatId(phone: string): string {
  return `${phone.replace(/\D/g, "")}@c.us`;
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
  input: { toPhone: string; text: string },
): Promise<IWahaSendResult> {
  const response = await wahaRequest(apiKey, fetchFn, {
    baseUrl: target.baseUrl,
    path: "/api/sendText",
    json: { session: target.sessionName, chatId: toChatId(input.toPhone), text: input.text },
  });
  return { providerMessageId: extractMessageId(response.body) };
}

export interface IWahaSendMediaInput {
  toPhone: string;
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
    json: {
      session: target.sessionName,
      chatId: toChatId(input.toPhone),
      file: { mimetype: input.mimetype, url: input.mediaUrl, filename: input.filename },
      ...(input.caption && !isVoice ? { caption: input.caption } : {}),
      ...(isVoice ? { convert: true } : {}),
    },
  });
  return { providerMessageId: extractMessageId(response.body) };
}
