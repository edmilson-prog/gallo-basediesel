import type { IMessage } from "@/shared/types";

/**
 * Whether a message carries nothing a human can read — no text and no media
 * discriminator.
 *
 * These rows are WhatsApp protocol noise that older webhook builds persisted as
 * if they were real messages: album headers announcing sibling media,
 * button-only interactive payloads, e2e notifications. The WAHA parser now
 * rejects them at the source (see `wahaMessageKind` / the content guard in
 * `src/providers/whatsapp/waha/parser.ts`), but ~20k such rows predate the fix
 * and are unrecoverable — their raw payloads aged out of `webhook_deliveries`.
 * This is the read-side safety net for those.
 *
 * A media message with no caption is NOT content-free: its bubble renders the
 * media (or an "unavailable" notice when the download failed). Structured
 * shares (location/contact) always carry their data encoded in `text`.
 */
export function isContentFreeMessage(message: Pick<IMessage, "text" | "mediaType">): boolean {
  return !message.mediaType && !message.text?.trim();
}
