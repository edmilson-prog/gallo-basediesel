import type { ID } from "@/shared/types";

/**
 * Deterministic, seeded "used in N quotes" badge value for the demo. NOT real
 * tracking — quote items don't record their originating kit yet (deferred to
 * Fase 2). Same id always yields the same number, range 0..23.
 */
export function kitUsageMock(id: ID): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return hash % 24;
}
