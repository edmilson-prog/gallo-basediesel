// AUTO-GENERATED MIRROR — DO NOT EDIT.
// Source: src/providers/whatsapp/phone.ts (sync: bun run scripts/sync-whatsapp-shared.ts)

/**
 * E.164 helpers shared by the WhatsApp engines (PRDs 112/113).
 * Runtime-agnostic file: relative imports only, Web APIs only.
 */

import { WhatsAppProviderError } from "./errors.ts";

/** E.164: leading +, 8–15 digits, no leading zero. */
export const E164_REGEX = /^\+[1-9]\d{7,14}$/;

/** Throws VALIDATION_ERROR when `phone` is not E.164 (PRD-112 RF-020). */
export function assertE164(phone: string): void {
  if (!E164_REGEX.test(phone)) {
    throw new WhatsAppProviderError(
      "VALIDATION_ERROR",
      422,
      `Telefone inválido — esperado formato E.164 (+5555912345678), recebido: ${phone}`,
    );
  }
}

/** Wire format used by both Meta and Evolution: E.164 without the +. */
export function toWireNumber(phone: string): string {
  assertE164(phone);
  return phone.slice(1);
}

/** Normalizes provider phone strings ("5555912345678") back to E.164. */
export function toE164(digits: string): string {
  const clean = digits.replace(/[^\d]/g, "");
  return clean.length > 0 ? `+${clean}` : "";
}
