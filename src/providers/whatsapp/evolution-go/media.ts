/**
 * Inbound media reference for Evolution Go. whatsmeow has NO downloadable id —
 * to re-download an inbound media it needs the ORIGINAL message proto (carrying
 * the encryption keys: mediaKey / fileEncSHA256 / directPath / …). So we
 * serialize the exact media sub-node the webhook delivered, keyed by its proto
 * type (imageMessage / audioMessage / videoMessage / documentMessage), into the
 * IWhatsAppProvider `mediaId` string. The provider wraps it as `{ message: … }`
 * and POSTs it to `/message/downloadmedia`; the Go server reconstructs the
 * `waE2E.Message` proto and lets whatsmeow re-download + decrypt from the CDN.
 *
 * Round-trips verbatim: the byte fields arrive base64-encoded (Go marshals
 * `[]byte` as base64) and are sent back base64-encoded, so the server's
 * `[]byte` JSON unmarshal restores the exact bytes.
 */

import { WhatsAppProviderError } from "../errors";

/** Proto keys the Go server probes in DownloadMedia (msg.GetXxxMessage()). */
export type GoMediaMessageKey =
  | "imageMessage"
  | "audioMessage"
  | "videoMessage"
  | "documentMessage";

/**
 * A partial `waE2E.Message` carrying exactly one media sub-node — the shape the
 * `/message/downloadmedia` body expects under its `message` field.
 */
export type IGoMediaMessage = {
  [K in GoMediaMessageKey]?: unknown;
};

export function encodeGoMediaRef(message: IGoMediaMessage): string {
  return JSON.stringify(message);
}

export function decodeGoMediaRef(raw: string): IGoMediaMessage {
  try {
    const parsed = JSON.parse(raw) as IGoMediaMessage;
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

export interface IGoMediaPayload {
  bytes: Uint8Array;
  mimeType: string;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * The Go server returns the downloaded media as a Data URL string
 * (`data:<mime>;base64,<b64>`, from Go's `dataurl.New(bytes, mime).String()`)
 * under `data.base64`. Parse it into bytes + mime; tolerate a bare base64
 * string defensively. Throws (invalid base64) — callers map it to an
 * INTEGRATION_ERROR.
 */
export function decodeGoMediaPayload(raw: string): IGoMediaPayload {
  const dataUrl = /^data:([^;,]*);base64,([\s\S]*)$/.exec(raw);
  if (dataUrl) {
    return { bytes: base64ToBytes(dataUrl[2] ?? ""), mimeType: dataUrl[1] || "application/octet-stream" };
  }
  // Defensive fallback: a bare base64 string with no `data:` prefix.
  return { bytes: base64ToBytes(raw), mimeType: "application/octet-stream" };
}
