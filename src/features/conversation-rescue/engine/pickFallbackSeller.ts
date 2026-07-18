import type { ID } from "@/shared/types";

/**
 * FNV-1a string hash — small, dependency-free, deterministic. Used only to
 * turn a seed string into a pseudo-random but reproducible index; not a
 * cryptographic hash.
 */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Deterministic pseudo-random pick among candidates (spec 2026-07-17). Never
 * uses `Math.random()` — the same `(candidateIds, seed)` pair always yields
 * the same result, so callers can seed with e.g. `rescueId + tickTimestamp`
 * to get a fresh-looking distribution in production while staying testable.
 */
export function pickFallbackSeller(candidateIds: ID[], seed: string): ID | null {
  if (candidateIds.length === 0) return null;
  const index = fnv1a(seed) % candidateIds.length;
  return candidateIds[index] ?? null;
}
