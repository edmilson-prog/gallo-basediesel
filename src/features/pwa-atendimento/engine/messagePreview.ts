/**
 * One-line preview of the last message of a conversation.
 *
 * The desktop Inbox prefixes media previews with an emoji (`📎 Foto`). The kit
 * review replaced that with an icon plus a plain label, following the brand
 * rule that keeps the parent mark emoji-free — so this returns the icon as a
 * separate field and lets the row render it.
 */
import type { IMessage, MessageMediaType } from "@/shared/types";

export interface IPwaPreview {
  /** Iconify name for the leading glyph, or null for a plain text preview. */
  icon: string | null;
  text: string;
}

const MEDIA_PREVIEW: Record<MessageMediaType, { icon: string; label: string }> = {
  image: { icon: "mdi:image-outline", label: "Foto" },
  audio: { icon: "mdi:microphone", label: "Áudio" },
  video: { icon: "mdi:video-outline", label: "Vídeo" },
  document: { icon: "mdi:file-document-outline", label: "Documento" },
  sticker: { icon: "mdi:sticker-emoji", label: "Sticker" },
  location: { icon: "mdi:map-marker-outline", label: "Localização" },
  contact: { icon: "mdi:account-box-outline", label: "Contato" },
};

const OUTBOUND_PREFIX = "Você: ";

export function buildPwaPreview(message: IMessage | null): IPwaPreview {
  if (!message) return { icon: null, text: "" };

  const outbound = message.direction === "out";

  if (message.mediaType) {
    const meta = MEDIA_PREVIEW[message.mediaType];
    // A caption says more than the media label — prefer it when present.
    const caption = message.text?.trim();
    const body = caption || meta.label;
    return { icon: meta.icon, text: outbound ? OUTBOUND_PREFIX + body : body };
  }

  const text = message.text?.trim();
  if (!text) return { icon: null, text: "Mensagem não suportada" };

  return { icon: null, text: outbound ? OUTBOUND_PREFIX + text : text };
}
