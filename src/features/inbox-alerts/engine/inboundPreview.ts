import type { MessageMediaType } from "@/shared/types";

/** Shown when the message carries neither text nor a recognizable media type —
 *  notably the `last_message_at` fallback path, which has no message row. */
export const PREVIEW_FALLBACK = "Nova mensagem";

/** Max characters before truncation, chosen to fit two lines of the toast body. */
export const PREVIEW_MAX_LENGTH = 90;

const MEDIA_LABEL: Record<MessageMediaType, string> = {
  image: "Foto",
  audio: "Áudio",
  video: "Vídeo",
  document: "Documento",
  sticker: "Figurinha",
  location: "Localização",
  contact: "Contato",
};

/**
 * STRUCTURED content: `location` and `contact` have no binary payload — their
 * data lives ENCODED in `text` (see `@/providers/whatsapp/contentFormat`). The
 * label always wins for these, otherwise the toast would show raw coordinates
 * or vCard fragments.
 */
const STRUCTURED_MEDIA: readonly MessageMediaType[] = ["location", "contact"];

/**
 * One-line preview of an inbound message for the toast body. A caption always
 * beats the media label (it is what the customer actually wrote), except for
 * structured content.
 */
export function inboundPreview(
  text: string | null | undefined,
  mediaType?: MessageMediaType | null,
): string {
  if (mediaType && STRUCTURED_MEDIA.includes(mediaType)) return MEDIA_LABEL[mediaType];

  const collapsed = (text ?? "").replace(/\s+/g, " ").trim();
  if (collapsed) {
    return collapsed.length > PREVIEW_MAX_LENGTH
      ? `${collapsed.slice(0, PREVIEW_MAX_LENGTH)}…`
      : collapsed;
  }

  if (mediaType) return MEDIA_LABEL[mediaType] ?? PREVIEW_FALLBACK;
  return PREVIEW_FALLBACK;
}
