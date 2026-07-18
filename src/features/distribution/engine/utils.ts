import type { ISeller } from "@/shared/types";

export { isWithinBusinessHours } from "./businessHours";

/** Sellers whose availability is `online`, sorted alphabetically for stability. */
export function getOnlineSellers(sellers: ISeller[]): ISeller[] {
  return sellers
    .filter((s) => s.active && s.availability === "online")
    .slice()
    .sort((a, b) => a.fullName.localeCompare(b.fullName, "pt-BR"));
}

/**
 * Select the seller carrying the smallest open-conversation load.
 *
 * Tie-break: the seller who appears earliest in `candidates` wins (callers
 * pre-sort by something meaningful — alphabetical is good enough on the MVP).
 */
export function selectByLoad(
  candidates: ISeller[],
  loadBySeller: Record<string, number>,
): ISeller | null {
  if (candidates.length === 0) return null;
  let best: ISeller | null = null;
  let bestLoad = Number.POSITIVE_INFINITY;
  for (const seller of candidates) {
    const load = loadBySeller[seller.id] ?? 0;
    if (load < bestLoad) {
      bestLoad = load;
      best = seller;
    }
  }
  return best;
}

/**
 * Round-robin cursor.
 *
 * `lastAssignedSellerId` tells which seller received the previous round; the
 * next available seller in the ordered list takes the new conversation. When
 * the cursor is null or stale, returns the first candidate.
 */
export function selectByRoundRobin(
  candidates: ISeller[],
  lastAssignedSellerId: string | null,
): ISeller | null {
  if (candidates.length === 0) return null;
  if (!lastAssignedSellerId) return candidates[0];
  const idx = candidates.findIndex((c) => c.id === lastAssignedSellerId);
  if (idx === -1) return candidates[0];
  return candidates[(idx + 1) % candidates.length];
}

/**
 * Match specialty keywords against the first customer message.
 *
 * Case-insensitive; word-boundary aware via lowercase substring check (the
 * keyword catalog is curated, so substring matches are good enough on the MVP
 * and avoid regex injection risks).
 */
export function findSpecialtyMatches(firstMessageText: string, keywords: string[]): string[] {
  if (!firstMessageText) return [];
  const haystack = firstMessageText.toLowerCase();
  const matches: string[] = [];
  for (const keyword of keywords) {
    const needle = keyword.trim().toLowerCase();
    if (needle.length === 0) continue;
    if (haystack.includes(needle)) matches.push(needle);
  }
  return matches;
}
