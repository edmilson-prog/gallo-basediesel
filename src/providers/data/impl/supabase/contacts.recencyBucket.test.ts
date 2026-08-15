import { describe, expect, it } from "vitest";
import { contactRecencyBucketRange } from "./contacts";

// Fixed instant so every boundary is deterministic.
const NOW = new Date("2026-08-06T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY_MS);

describe("contactRecencyBucketRange", () => {
  it("nunca means last_contact_at IS NULL", () => {
    expect(contactRecencyBucketRange("nunca", NOW)).toEqual({ isNull: true });
  });

  it("hoje has no upper bound and excludes exactly-1-day-old contacts", () => {
    const range = contactRecencyBucketRange("hoje", NOW);
    expect(range.lte).toBeUndefined();
    expect(range.gt).toBe(daysAgo(1).toISOString());
  });

  it("7d is bounded by (now-8d, now]", () => {
    expect(contactRecencyBucketRange("7d", NOW)).toEqual({
      gt: daysAgo(8).toISOString(),
      lte: NOW.toISOString(),
    });
  });

  it("30d is bounded by (now-31d, now]", () => {
    expect(contactRecencyBucketRange("30d", NOW)).toEqual({
      gt: daysAgo(31).toISOString(),
      lte: NOW.toISOString(),
    });
  });

  it("90d+ has no lower bound and excludes exactly-90-day-old contacts", () => {
    const range = contactRecencyBucketRange("90d+", NOW);
    expect(range.gt).toBeUndefined();
    expect(range.lte).toBe(daysAgo(91).toISOString());
  });

  it("leaves a deliberate gap: a contact 45 days ago matches neither 30d nor 90d+", () => {
    const t = daysAgo(45).getTime();
    const thirty = contactRecencyBucketRange("30d", NOW);
    const ninetyPlus = contactRecencyBucketRange("90d+", NOW);
    // 30d requires t > gt (and t <= lte); 45 days ago is older than the 31-day cutoff.
    expect(t > Date.parse(thirty.gt!)).toBe(false);
    // 90d+ requires t <= lte; 45 days ago is more recent than the 91-day cutoff.
    expect(t <= Date.parse(ninetyPlus.lte!)).toBe(false);
  });

  it("boundary contacts land on the correct side: 31 days ago is in the gap, 91 days ago is in 90d+", () => {
    const thirtyOne = daysAgo(31).getTime();
    const ninetyOne = daysAgo(91).getTime();
    const thirty = contactRecencyBucketRange("30d", NOW);
    const ninetyPlus = contactRecencyBucketRange("90d+", NOW);

    // 31 days ago: excluded from 30d (not > now-31d) and from 90d+ (not <= now-91d).
    expect(thirtyOne > Date.parse(thirty.gt!)).toBe(false);
    expect(thirtyOne <= Date.parse(ninetyPlus.lte!)).toBe(false);

    // 91 days ago: included in 90d+ (<=  now-91d, inclusive).
    expect(ninetyOne <= Date.parse(ninetyPlus.lte!)).toBe(true);
  });

  it("30 days ago still matches 30d (inclusive upper bound of the window)", () => {
    const thirty = daysAgo(30).getTime();
    const range = contactRecencyBucketRange("30d", NOW);
    expect(thirty > Date.parse(range.gt!)).toBe(true);
    expect(thirty <= Date.parse(range.lte!)).toBe(true);
  });
});
