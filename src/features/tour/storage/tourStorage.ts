// Persistence boundary for the guided tour. ALL localStorage access lives here
// so promoting to Supabase later means reimplementing only this file.
// Keys are per-user: `gallo-tour-seen:<userId>` (JSON string[]) and
// `gallo-tour-optout:<userId>` ("1" | "0").

const SEEN_PREFIX = "gallo-tour-seen:";
const OPTOUT_PREFIX = "gallo-tour-optout:";

function ls(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function getSeen(userId: string): Set<string> {
  const store = ls();
  if (!store || !userId) return new Set();
  try {
    const raw = store.getItem(SEEN_PREFIX + userId);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter((k) => typeof k === "string")) : new Set();
  } catch {
    return new Set();
  }
}

export function isSeen(userId: string, key: string): boolean {
  return getSeen(userId).has(key);
}

export function markSeen(userId: string, key: string): void {
  const store = ls();
  if (!store || !userId) return;
  const seen = getSeen(userId);
  if (seen.has(key)) return;
  seen.add(key);
  try {
    store.setItem(SEEN_PREFIX + userId, JSON.stringify([...seen]));
  } catch {
    // ignore quota / unavailable storage
  }
}

export function getOptOut(userId: string): boolean {
  const store = ls();
  if (!store || !userId) return false;
  try {
    return store.getItem(OPTOUT_PREFIX + userId) === "1";
  } catch {
    return false;
  }
}

export function setOptOut(userId: string, value: boolean): void {
  const store = ls();
  if (!store || !userId) return;
  try {
    store.setItem(OPTOUT_PREFIX + userId, value ? "1" : "0");
  } catch {
    // ignore
  }
}

export function resetAll(userId: string): void {
  const store = ls();
  if (!store || !userId) return;
  try {
    store.removeItem(SEEN_PREFIX + userId);
  } catch {
    // ignore
  }
}
