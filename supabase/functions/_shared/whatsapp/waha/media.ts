// AUTO-GENERATED MIRROR — DO NOT EDIT.
// Source: src/providers/whatsapp/waha/media.ts (sync: bun run scripts/sync-whatsapp-shared.ts)

/**
 * Downloads inbound media from a WAHA `payload.media.url` — same X-Api-Key
 * auth as every other WAHA endpoint (docs: "Receiving files").
 */

import { WhatsAppProviderError } from "../errors.ts";

export interface IWahaMediaDownload {
  data: Uint8Array;
  mimeType: string;
  sizeBytes: number;
}

export async function downloadWahaMedia(
  apiKey: string,
  fetchFn: typeof fetch,
  mediaUrl: string,
): Promise<IWahaMediaDownload> {
  const response = await fetchFn(mediaUrl, { headers: { "X-Api-Key": apiKey } });
  if (!response.ok) {
    throw new WhatsAppProviderError(
      "INTEGRATION_ERROR",
      502,
      `Falha ao baixar mídia do WAHA (HTTP ${response.status})`,
      { mediaUrl },
    );
  }
  const buffer = await response.arrayBuffer();
  const data = new Uint8Array(buffer);
  return {
    data,
    mimeType: response.headers.get("content-type") ?? "application/octet-stream",
    sizeBytes: data.byteLength,
  };
}
