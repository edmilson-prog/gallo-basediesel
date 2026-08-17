/** Digits-only, so a formatted number and a raw one compare equal. */
const digitsOf = (value: string | null | undefined) => (value ?? "").replace(/\D/g, "");

/** Shortest tail that still identifies a line within a DDD. */
const MIN_SIGNIFICANT_DIGITS = 8;

/**
 * Whether two Brazilian numbers are the same line.
 *
 * Compares by SUFFIX rather than normalising. The base mixes E.164 with the 55
 * prefix (`+554699198739`), bare DDD+number (`4699198739`), and both the 8- and
 * 9-digit mobile forms. Inserting or stripping the 9th digit to "normalise" is
 * how you silently merge two different people, so this never rewrites a number
 * — it only compares the tail the two have in common.
 *
 * The tail is capped at 10 digits (DDD + 8) so a number carrying the country
 * code still matches the same line stored without it. It is floored at 8 so a
 * short or truncated value can never collide with everything.
 */
export function isSamePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = digitsOf(a);
  const right = digitsOf(b);
  if (left.length < MIN_SIGNIFICANT_DIGITS || right.length < MIN_SIGNIFICANT_DIGITS) return false;
  const tail = Math.min(left.length, right.length, 10);
  return left.slice(-tail) === right.slice(-tail);
}
