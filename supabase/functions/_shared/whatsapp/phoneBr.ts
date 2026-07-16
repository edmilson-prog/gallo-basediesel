// AUTO-GENERATED MIRROR — DO NOT EDIT.
// Source: src/providers/whatsapp/phoneBr.ts (sync: bun run scripts/sync-whatsapp-shared.ts)

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
