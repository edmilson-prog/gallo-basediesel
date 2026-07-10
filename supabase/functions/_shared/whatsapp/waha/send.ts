// AUTO-GENERATED MIRROR — DO NOT EDIT.
// Source: src/providers/whatsapp/waha/send.ts (sync: bun run scripts/sync-whatsapp-shared.ts)

/** WAHA outbound send — text (`/api/sendText`) and media (`/api/sendImage`/`/api/sendFile`). */

import { WhatsAppProviderError } from "../errors.ts";
import { wahaRequest } from "./client.ts";
import type { IWahaSessionTarget } from "./session.ts";

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

export async function sendWahaMedia(
  apiKey: string,
  fetchFn: typeof fetch,
  target: IWahaSessionTarget,
  input: IWahaSendMediaInput,
): Promise<IWahaSendResult> {
  const endpoint = input.mediaType === "image" ? "/api/sendImage" : "/api/sendFile";
  const response = await wahaRequest(apiKey, fetchFn, {
    baseUrl: target.baseUrl,
    path: endpoint,
    json: {
      session: target.sessionName,
      chatId: toChatId(input.toPhone),
      file: { mimetype: input.mimetype, url: input.mediaUrl, filename: input.filename },
      ...(input.caption ? { caption: input.caption } : {}),
    },
  });
  return { providerMessageId: extractMessageId(response.body) };
}
