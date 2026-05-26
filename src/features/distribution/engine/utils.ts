import type { IBusinessHoursWindow, ISeller } from "@/shared/types";

/** Parse `"HH:mm"` into minutes since midnight. Returns NaN on bad input. */
function timeToMinutes(value: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return Number.NaN;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return Number.NaN;
  return hours * 60 + minutes;
}

/**
 * Returns true when `date` falls inside any enabled business-hours window.
 *
 * Windows that span midnight (e.g. opening at 22:00 and closing at 02:00) are
 * **not** supported — keeps the comparison straightforward and matches the UI
 * editor in the admin panel.
 */
export function isWithinBusinessHours(date: Date, windows: IBusinessHoursWindow[]): boolean {
  const weekday = date.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
  const minutesOfDay = date.getHours() * 60 + date.getMinutes();
  for (const win of windows) {
    if (!win.enabled) continue;
    if (win.weekday !== weekday) continue;
    const open = timeToMinutes(win.openAt);
    const close = timeToMinutes(win.closeAt);
    if (Number.isNaN(open) || Number.isNaN(close)) continue;
    if (minutesOfDay >= open && minutesOfDay < close) return true;
  }
  return false;
}

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
