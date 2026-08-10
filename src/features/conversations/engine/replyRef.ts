import type { IMessage, IMessageReplyRef } from "@/shared/types";
import { CONVERSATION_STRINGS } from "../i18n/pt-BR";

/**
 * Regras de apresentação da citação (reply/quote).
 *
 * A reconciliação de ids vive na camada de provider
 * (`src/providers/whatsapp/waha/replyRef.ts`), porque o webhook precisa dela
 * também. Aqui fica só o que é da tela.
 */

/**
 * Se uma mensagem pode ser citada.
 *
 * `queued`/`failed` nunca chegaram ao WhatsApp, então não têm
 * `provider_message_id` para o `reply_to` da WAHA — o envio sairia sem a
 * citação, silenciosamente. Mensagem de sistema não existe do lado do
 * WhatsApp.
 */
export function canReplyTo(message: IMessage): boolean {
  if (message.authorType === "system") return false;
  return message.status !== "queued" && message.status !== "failed";
}

/** Autor da mensagem citada, como aparece no cabeçalho da citação. */
export function quotedAuthorLabel(ref: IMessageReplyRef, contactName?: string): string {
  if (ref.direction === "out") return CONVERSATION_STRINGS.reply.you;
  return contactName?.trim() || CONVERSATION_STRINGS.reply.contactFallback;
}

const MEDIA_LABELS: Record<string, { icon: string; label: string }> = {
  image: { icon: "mdi:image", label: CONVERSATION_STRINGS.reply.media.image },
  sticker: { icon: "mdi:sticker-emoji", label: CONVERSATION_STRINGS.reply.media.image },
  audio: { icon: "mdi:microphone", label: CONVERSATION_STRINGS.reply.media.audio },
  video: { icon: "mdi:video", label: CONVERSATION_STRINGS.reply.media.video },
  document: { icon: "mdi:file-document", label: CONVERSATION_STRINGS.reply.media.document },
  location: { icon: "mdi:map-marker", label: CONVERSATION_STRINGS.reply.media.location },
  contact: { icon: "mdi:account", label: CONVERSATION_STRINGS.reply.media.contact },
};

/**
 * Rótulo com ícone para citação SEM texto legível. Retorna null quando há
 * texto — nesse caso o trecho é o próprio conteúdo e vence o rótulo.
 */
export function quotedMediaLabel(ref: IMessageReplyRef): { icon: string; label: string } | null {
  if (ref.text?.trim()) return null;
  const byType = ref.mediaType ? MEDIA_LABELS[ref.mediaType] : undefined;
  return byType ?? { icon: "mdi:message-outline", label: CONVERSATION_STRINGS.reply.media.generic };
}
