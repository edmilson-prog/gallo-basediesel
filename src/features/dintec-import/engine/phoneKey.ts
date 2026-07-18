import { normalizeBrDialDigits } from "@/providers/whatsapp/phoneBr";

/**
 * Normalizes a Brazilian phone number (from either the DINTEC export or
 * customers.phone) into a DDD + last-8-digits comparison key, so that
 * "+5517982016888" (13 digits, country code + 9-digit mobile) and
 * "17982016888" (11 digits, no country code) collapse to the same key —
 * DDD "17" + last 8 digits, dropping the mobile-only leading "9".
 */
export function normalizePhoneKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    digits = digits.slice(2);
  }
  if (digits.length === 10 || digits.length === 11) {
    const ddd = digits.slice(0, 2);
    const core = digits.slice(-8);
    return ddd + core;
  }
  return null;
}

/**
 * Converts a raw DINTEC phone value into the platform's storable dial format —
 * the MANDATORY rule from docs/dev/dintec-providers.md ("Normalização de
 * telefone em cargas DINTEC"): always store `'+' + digits`, applying the BR
 * DDI 55 when the value is a bare valid local number. The 2026-07-12 import
 * wrote raw ERP values and broke WAHA sends (JID dialed Germany) — this
 * function is what every DINTEC load must go through before writing
 * `customers.phone`.
 *
 * Values that cannot be normalized (invalid DDD, odd length) are returned
 * VERBATIM — visibly un-normalized for assisted triage — never silently
 * '+'-prefixed into the wrong country. The 9th digit is never added or
 * removed here (PR #302: only WhatsApp confirms that variant).
 */
export function dintecDialPhone(raw: string | null | undefined): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";
  // Explicit international prefix: trust it, store canonical '+<digits>'.
  if (trimmed.startsWith("+")) return `+${digits}`;
  const dial = normalizeBrDialDigits(trimmed);
  // Dialable BR number (55 + DDD + 8/9 local, whether the DDI came from the
  // ERP value itself or was prefixed by normalizeBrDialDigits).
  if ((dial.length === 12 || dial.length === 13) && dial.startsWith("55")) {
    return `+${dial}`;
  }
  return trimmed;
}
