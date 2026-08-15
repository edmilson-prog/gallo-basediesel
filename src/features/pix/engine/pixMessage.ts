import type { PixKeyType } from "./pixKeyFormat";

const KEY_TYPE_LABEL: Record<PixKeyType, string> = {
  cnpj: "CNPJ",
  cpf: "CPF",
  phone: "Telefone",
  email: "E-mail",
  random: "Aleatória",
};

/**
 * Strips the characters WhatsApp reads as formatting. An unbalanced `*` in the
 * receiver name turns the bold of the entire message inside out.
 */
export function sanitizeWhatsAppMarkers(value: string): string {
  return value
    .replace(/[*_~`]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export interface IPixCaptionInput {
  receiverName: string;
  keyType: PixKeyType;
  /** Attendant-authored text; falls back to the default block when empty. */
  context?: string;
  /** True when the key goes out as its own trailing message. */
  includeKeyHint: boolean;
}

/**
 * The text that precedes the key — either the message body (text-only send) or
 * the QR image caption. The key itself is NEVER part of this string: it goes in
 * its own trailing message so a long-press copies it clean (spec §3).
 */
export function buildPixCaption(input: IPixCaptionInput): string {
  const receiver = sanitizeWhatsAppMarkers(input.receiverName);
  const custom = input.context ? sanitizeWhatsAppMarkers(input.context) : "";

  const head = custom || `*Pagamento via PIX*\nFavorecido: ${receiver}`;
  const typeLine = custom ? "" : `Tipo de chave: ${KEY_TYPE_LABEL[input.keyType]}`;
  const hint = input.includeKeyHint
    ? "A chave vai na próxima mensagem — é só tocar e segurar para copiar."
    : "";

  return [head, typeLine, hint].filter(Boolean).join("\n");
}
