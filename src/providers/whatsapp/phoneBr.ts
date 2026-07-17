/**
 * BR mobile phone helpers shared by the WhatsApp webhook engines (Meta/Evolution
 * + WAHA) for phone→customer dedup. Runtime-agnostic file: relative imports
 * only, Web APIs only — mirrored into _shared/whatsapp/phoneBr.ts.
 *
 * Deliberately duplicated (not imported) from
 * src/features/conversations/engine/phoneBR.ts, which lives outside the
 * mirror-safe tree. Only insert the 9th digit — never remove one.
 */

const NON_DIGITS = /\D/g;

function digitsOf(input: string): string {
  return input.replace(NON_DIGITS, "");
}

/**
 * If `digits` is a 12-digit BR number (55+DDD+local8, no explicit 9th
 * digit), returns the 13-digit variant with "9" inserted right after the
 * DDD. Otherwise (already 13 digits, or outside the 55+12 shape), null.
 */
export function buildNineDigitCandidate(digits: string): string | null {
  const d = digitsOf(digits);
  if (!d.startsWith("55") || d.length !== 12) return null;
  const ddi = d.slice(0, 2);
  const ddd = d.slice(2, 4);
  const local8 = d.slice(4);
  return `${ddi}${ddd}9${local8}`;
}

/** Strips the optional leading 55 DDI to compare DDD+number. */
function localPart(phone: string): string {
  const d = digitsOf(phone);
  return d.startsWith("55") && d.length >= 12 ? d.slice(2) : d;
}

/** Two phone digit strings are the same BR number when they match exactly,
 *  or differ only by the 9th mobile digit (12 vs 13 digits). */
export function phoneDigitsMatchBr(a: string, b: string): boolean {
  const la = localPart(a);
  const lb = localPart(b);
  if (la.length === 0) return false;
  if (la === lb) return true;
  const [shortLocal, longLocal] = la.length < lb.length ? [la, lb] : [lb, la];
  if (shortLocal.length !== 10 || longLocal.length !== 11) return false;
  return longLocal[2] === "9" && shortLocal === longLocal.slice(0, 2) + longLocal.slice(3);
}

/** Valid Brazilian area codes (Anatel allocation). Gaps (23, 25-26, 29-30,
 *  36, 39-40, 50, 52, 56-60, 70, 72, 76, 78, 80, 90) are unassigned. */
const VALID_BR_DDD = new Set([
  "11", "12", "13", "14", "15", "16", "17", "18", "19",
  "21", "22", "24", "27", "28",
  "31", "32", "33", "34", "35", "37", "38",
  "41", "42", "43", "44", "45", "46", "47", "48", "49",
  "51", "53", "54", "55",
  "61", "62", "63", "64", "65", "66", "67", "68", "69",
  "71", "73", "74", "75", "77", "79",
  "81", "82", "83", "84", "85", "86", "87", "88", "89",
  "91", "92", "93", "94", "95", "96", "97", "98", "99",
]);

/**
 * Dial digits for outbound sends: prefixes Brazil's DDI (55) on bare local
 * numbers (10-11 digits, valid DDD, no trunk zero) stored without it — the
 * 2026-07-12 DINTEC import wrote ERP phones verbatim. An explicit leading
 * "+" is TRUSTED as E.164 and never prefixed: Chile (+56 9…) and Bolivia
 * (+591 7…) mobiles are also 10-11 digits and must not be corrupted. The
 * length rule (not a startsWith("55") check) is deliberate — DDD 55 is the
 * store's own region. Everything else passes through unchanged (fail-open;
 * the provider rejects bad numbers loudly).
 */
export function normalizeBrDialDigits(rawPhone: string): string {
  const digits = digitsOf(rawPhone);
  if (rawPhone.trim().startsWith("+")) return digits;
  if (
    (digits.length === 10 || digits.length === 11) &&
    !digits.startsWith("0") &&
    VALID_BR_DDD.has(digits.slice(0, 2))
  ) {
    return `55${digits}`;
  }
  return digits;
}
