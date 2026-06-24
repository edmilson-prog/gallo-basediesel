import type { Granularity, MetricBucket } from "@/shared/types/service-volume";
export type { Granularity, MetricBucket };

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Monday (ISO week start) of the week containing `d`, as YYYY-MM-DD (UTC). */
function isoWeekStart(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay(); // 0=Sun..6=Sat
  const diff = (day === 0 ? -6 : 1) - day; // shift back to Monday
  date.setUTCDate(date.getUTCDate() + diff);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function bucketKey(iso: string, g: Granularity): string {
  const d = new Date(iso);
  if (g === "month") return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
  if (g === "week") return isoWeekStart(d);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function bucketize(timestamps: string[], g: Granularity): MetricBucket[] {
  const counts = new Map<string, number>();
  for (const ts of timestamps) {
    const key = bucketKey(ts, g);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([bucket, value]) => ({ bucket, value }))
    .sort((a, b) => a.bucket.localeCompare(b.bucket));
}

export function averagePerDay(timestamps: string[], fromIso: string, toIso: string): number {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  const days = Math.max(1, Math.floor((to - from) / 86_400_000) + 1);
  return Math.round((timestamps.length / days) * 10) / 10;
}
