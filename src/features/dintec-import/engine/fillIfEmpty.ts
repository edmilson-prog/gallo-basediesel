/**
 * Enforces the import's core safety rule: DINTEC data only fills columns
 * the platform has NOTHING in — it never overwrites an existing value,
 * including values the platform itself wrote (e.g. WhatsApp-verified phone,
 * a manually edited name).
 */
export function fillIfEmpty<T>(
  existing: T | null | undefined,
  incoming: T | null | undefined,
): T | null {
  if (existing !== null && existing !== undefined && existing !== ("" as unknown as T)) {
    return existing;
  }
  return incoming ?? null;
}
