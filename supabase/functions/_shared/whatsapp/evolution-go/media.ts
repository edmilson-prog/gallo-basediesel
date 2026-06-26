// AUTO-GENERATED MIRROR — DO NOT EDIT.
// Source: src/providers/whatsapp/evolution-go/media.ts (sync: bun run scripts/sync-whatsapp-shared.ts)

/**
 * Inbound media reference for Evolution Go. whatsmeow media nodes carry the
 * download metadata (url/directPath/mediaKey/...) instead of a downloadable id.
 * We serialize them into the IWhatsAppProvider `mediaId` string so the contract
 * stays unchanged; the provider decodes it to build `/message/downloadimage`.
 */

import { WhatsAppProviderError } from "../errors.ts";

export interface IGoMediaRef {
  url?: string;
  directPath?: string;
  /** base64 string as delivered by the webhook (converted to ints at download). */
  mediaKey?: string;
  fileEncSHA256?: string;
  fileSHA256?: string;
  fileLength?: number;
  mimetype?: string;
}

export function encodeGoMediaRef(ref: IGoMediaRef): string {
  return JSON.stringify(ref);
}

export function decodeGoMediaRef(raw: string): IGoMediaRef {
  try {
    const parsed = JSON.parse(raw) as IGoMediaRef;
    if (typeof parsed !== "object" || parsed === null) throw new Error("not an object");
    return parsed;
  } catch {
    throw new WhatsAppProviderError(
      "VALIDATION_ERROR",
      422,
      "Referência de mídia da Evolution Go inválida",
    );
  }
}
