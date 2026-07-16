/**
 * Digit-normalized search candidates for phone/CNPJ/CPF matching.
 *
 * Stored Brazilian phones use the WhatsApp wire shape (digits with the 55
 * DDI, often WITHOUT the 9th mobile digit — JIDs drop it for numbers
 * registered before the 9th-digit rollout, e.g. +553388884188). A term typed
 * WITH the 9 (or with punctuation) must still match, so the search expands
 * the term into digit candidates compared as substrings of the `*_digits`
 * generated columns (migration 20260716210000). A variant only WIDENS the
 * OR — ambiguous shapes (11 digits = CPF or DDD+mobile) can add a useless
 * candidate but never remove a match. Candidates are digits-only by
 * construction; SQL consumers rely on that to skip LIKE-wildcard escaping.
 */

const NON_DIGITS = /\D/g;

export function digitsOf(input: string): string {
  return input.replace(NON_DIGITS, "");
}

/**
 * Returns the term's digits plus (at most) one 9th-digit variant, deduped.
 * Empty array when the term has no digits.
 */
export function buildDigitSearchCandidates(term: string): string[] {
  const d = digitsOf(term);
  if (!d) return [];
  const variant = ninthDigitVariant(d);
  return variant && variant !== d ? [d, variant] : [d];
}

/** 9th-digit variant by BR phone shape, or null when the shape isn't one. */
function ninthDigitVariant(d: string): string | null {
  // 55 + DDD + 9 + local8 → drop the 9
  if (d.length === 13 && d.startsWith("55") && d[4] === "9") {
    return d.slice(0, 4) + d.slice(5);
  }
  // 55 + DDD + local8 → insert the 9 after the DDD
  if (d.length === 12 && d.startsWith("55")) {
    return d.slice(0, 4) + "9" + d.slice(4);
  }
  // DDD + 9 + local8 → drop the 9
  if (d.length === 11 && d[2] === "9") {
    return d.slice(0, 2) + d.slice(3);
  }
  // DDD + local8 → insert the 9 after the DDD
  if (d.length === 10) {
    return d.slice(0, 2) + "9" + d.slice(2);
  }
  // 9 + local8, no DDD → drop the leading 9
  if (d.length === 9 && d.startsWith("9")) {
    return d.slice(1);
  }
  return null;
}
