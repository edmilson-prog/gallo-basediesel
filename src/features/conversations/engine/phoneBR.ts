/**
 * Brazilian phone helpers for the "Nova conversa" outbound flow.
 *
 * The canonical wire format used across the project (webhook contact resolution,
 * Evolution send) is digits-only with the `55` DDI: `55DDDNNNNNNNN` (12 or 13).
 * Storing customers in this shape is what makes the inbound webhook match on the
 * exact digits and the outbound send dial the right country. This module never
 * removes a digit; `buildNineDigitCandidate` only ever builds a 9th-digit candidate
 * for a caller to try — the WhatsApp network is still the source of truth for
 * whether that candidate is real (see resolveNumberCheckWithNineDigitFallback in
 * ../api/checkWhatsAppNumber.ts, which only adopts it on confirmation).
 */

const NON_DIGITS = /\D/g;

export function digitsOf(input: string): string {
  return input.replace(NON_DIGITS, "");
}

/** Heuristic for the "número novo" card: the typed text looks like a phone. */
export function looksLikePhone(input: string): boolean {
  return digitsOf(input).length >= 10;
}

export type NormalizeResult =
  | { ok: true; digits: string }
  | { ok: false; reason: "too_short" | "too_long" };

/** Normalizes free user input to canonical `55DDDNNNNNNNN` digits. */
export function normalizeBrPhone(input: string): NormalizeResult {
  const d = digitsOf(input);
  // Already carries the DDI: 55 + DDD(2) + local(8|9) = 12 or 13 digits.
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) {
    return { ok: true, digits: d };
  }
  // DDD + local, no DDI: 10 (landline) or 11 (mobile) digits → prefix 55.
  if (d.length === 10 || d.length === 11) {
    return { ok: true, digits: `55${d}` };
  }
  return { ok: false, reason: d.length < 10 ? "too_short" : "too_long" };
}

/**
 * If `digits` is a 12-digit BR number (55+DDD+local8, no explicit 9th
 * digit), returns the 13-digit variant with "9" inserted right after the
 * DDD. Otherwise (already 13 digits, or outside the 55+12 shape), null.
 * Only insert — never remove a digit.
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

/** Two phones are the same when their DDD+number match, DDI optional — and
 *  also when they differ only by the 9th mobile digit (12 vs 13 digits). */
export function samePhone(a: string, b: string): boolean {
  const la = localPart(a);
  const lb = localPart(b);
  if (la.length === 0) return false;
  if (la === lb) return true;
  const [shortLocal, longLocal] = la.length < lb.length ? [la, lb] : [lb, la];
  if (shortLocal.length !== 10 || longLocal.length !== 11) return false;
  return longLocal[2] === "9" && shortLocal === longLocal.slice(0, 2) + longLocal.slice(3);
}

/** `55DDDNNNNNNNN` → `(55) DD NNNNN-NNNN` (hyphen before the last 4). */
export function formatBrPhoneDisplay(digits: string): string {
  const d = digitsOf(digits);
  if (!d.startsWith("55") || d.length < 12) return digits;
  const ddi = d.slice(0, 2);
  const ddd = d.slice(2, 4);
  const local = d.slice(4);
  if (local.length < 5) return `(${ddi}) ${ddd} ${local}`.trimEnd();
  const hyphenAt = local.length - 4;
  return `(${ddi}) ${ddd} ${local.slice(0, hyphenAt)}-${local.slice(hyphenAt)}`;
}
