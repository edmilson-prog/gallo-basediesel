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
