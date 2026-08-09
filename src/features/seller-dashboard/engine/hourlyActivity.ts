export interface IHourlyActivityPoint {
  hour: number;
  label: string;
  count: number;
}

const HOUR_MS = 60 * 60 * 1000;
const BRT_OFFSET_MS = 3 * HOUR_MS;

/**
 * Buckets conversations by hour-of-day for the same calendar day as
 * `referenceIso`, in America/Sao_Paulo time (fixed UTC-3 — no DST since
 * 2019). Returns one point per hour from 0 up to the reference hour
 * (inclusive) — the FULL elapsed BRT day so far, not a rolling window —
 * so the sum of `count` across all points always equals the number of
 * conversations created today, matching the "Atendimentos" KPI total for
 * the "hoje" period (see `engine/period.ts`).
 */
export function bucketConversationsByHour(
  conversations: { createdAt: string }[],
  referenceIso: string,
): IHourlyActivityPoint[] {
  const toBrt = (iso: string) => new Date(new Date(iso).getTime() - BRT_OFFSET_MS);

  const refBrt = toBrt(referenceIso);
  const refDayKey = refBrt.toISOString().slice(0, 10);
  const currentHour = refBrt.getUTCHours();

  const counts = new Map<number, number>();
  for (const conv of conversations) {
    const brt = toBrt(conv.createdAt);
    if (brt.toISOString().slice(0, 10) !== refDayKey) continue;
    const hour = brt.getUTCHours();
    counts.set(hour, (counts.get(hour) ?? 0) + 1);
  }

  const points: IHourlyActivityPoint[] = [];
  for (let hour = 0; hour <= currentHour; hour++) {
    points.push({ hour, label: `${hour}h`, count: counts.get(hour) ?? 0 });
  }
  return points;
}
