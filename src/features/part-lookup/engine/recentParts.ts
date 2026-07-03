export const RECENT_CAP = 8;

export function pushRecent(list: string[], id: string, cap = RECENT_CAP): string[] {
  return [id, ...list.filter((x) => x !== id)].slice(0, cap);
}

export function parseRecent(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
