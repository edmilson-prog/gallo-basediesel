export interface IHourlyActivityPoint {
  hour: number;
  label: string;
  count: number;
}

const HOUR_MS = 60 * 60 * 1000;
const BRT_OFFSET_MS = 3 * HOUR_MS;
const WINDOW_HOURS = 7;

/**
 * Buckets conversations by hour-of-day for the same calendar day as
 * `referenceIso`, in America/Sao_Paulo time (fixed UTC-3 — Brazil has had
 * no DST since 2019, so a plain offset subtraction is deterministic and
 * doesn't depend on the runtime's local timezone). Returns a rolling
 * window of `WINDOW_HOURS + 1` points ending at the reference hour.
 */
export function bucketConversationsByHour(
  conversations: { createdAt: string }[],
  referenceIso: string,
): IHourlyActivityPoint[] {
  const toBrt = (iso: string) => new Date(new Date(iso).getTime() - BRT_OFFSET_MS);

  const refBrt = toBrt(referenceIso);
  const refDayKey = refBrt.toISOString().slice(0, 10);
  const currentHour = refBrt.getUTCHours();
  const startHour = Math.max(0, currentHour - WINDOW_HOURS);

  const counts = new Map<number, number>();
  for (const conv of conversations) {
    const brt = toBrt(conv.createdAt);
    if (brt.toISOString().slice(0, 10) !== refDayKey) continue;
    const hour = brt.getUTCHours();
    counts.set(hour, (counts.get(hour) ?? 0) + 1);
  }

  const points: IHourlyActivityPoint[] = [];
  for (let hour = startHour; hour <= currentHour; hour++) {
    points.push({ hour, label: `${hour}h`, count: counts.get(hour) ?? 0 });
  }
  return points;
}
