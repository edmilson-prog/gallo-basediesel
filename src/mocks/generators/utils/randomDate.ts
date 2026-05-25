import type { ISO8601 } from "@/shared/types";
import type { ISeededContext } from "./seededRandom";

/** Inclusive milliseconds-based random date between two anchors. */
export function randomDate(ctx: ISeededContext, start: Date, end: Date): Date {
  const lo = start.getTime();
  const hi = end.getTime();
  if (hi < lo) {
    throw new Error("randomDate: end must be >= start");
  }
  return new Date(Math.floor(ctx.rng() * (hi - lo + 1)) + lo);
}

/** ISO 8601 string variant of {@link randomDate}. */
export function randomISO(ctx: ISeededContext, start: Date, end: Date): ISO8601 {
  return randomDate(ctx, start, end).toISOString();
}

/** Date `days` ago from `from` (default: now). Useful for windowed history. */
export function daysAgo(days: number, from: Date = new Date()): Date {
  const d = new Date(from);
  d.setDate(d.getDate() - days);
  return d;
}

/** Reference period in `YYYY-MM` for a given date. */
export function monthRef(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** First and last instant of a calendar month for the given reference date. */
export function monthRange(date: Date): { start: Date; end: Date } {
  const start = new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}
