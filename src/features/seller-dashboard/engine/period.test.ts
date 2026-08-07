import { describe, expect, it } from "vitest";
import { resolveSellerPeriod } from "./period";

describe("resolveSellerPeriod", () => {
  it("resolves 'hoje' as the BRT calendar day (00:00 BRT to now), with a same-elapsed-time previous-day window for fair deltas", () => {
    const w = resolveSellerPeriod("hoje", "2026-07-23T17:00:00.000Z"); // 14h BRT = 14h elapsed since BRT midnight
    expect(w.label).toBe("Hoje");
    expect(w.startIso).toBe("2026-07-23T03:00:00.000Z"); // 00:00 BRT = 03:00 UTC
    expect(w.endIso).toBe("2026-07-23T17:00:00.000Z");
    expect(w.previousStartIso).toBe("2026-07-22T03:00:00.000Z"); // 00:00 BRT the day before
    expect(w.previousEndIso).toBe("2026-07-22T17:00:00.000Z"); // same 14h elapsed, previous day
  });

  it("keeps 'hoje' anchored to the same BRT day just after midnight, with a near-zero previous window", () => {
    const w = resolveSellerPeriod("hoje", "2026-07-23T03:30:00.000Z"); // 00:30 BRT
    expect(w.startIso).toBe("2026-07-23T03:00:00.000Z");
    expect(w.endIso).toBe("2026-07-23T03:30:00.000Z");
    expect(w.previousStartIso).toBe("2026-07-22T03:00:00.000Z");
    expect(w.previousEndIso).toBe("2026-07-22T03:30:00.000Z");
  });

  it("aligns '7d' and '30d' to BRT midnight so the daily chart emits exactly N whole-day buckets", () => {
    // 2026-07-23T12:00Z is 09:00 BRT. BRT midnight today = 2026-07-23T03:00Z.
    // "7 dias" = today plus the 6 whole days before it → starts 2026-07-17T03:00Z.
    const w7 = resolveSellerPeriod("7d", "2026-07-23T12:00:00.000Z");
    expect(w7.label).toBe("7 dias");
    expect(w7.startIso).toBe("2026-07-17T03:00:00.000Z");
    expect(w7.endIso).toBe("2026-07-23T12:00:00.000Z");
    // Previous window: the 7 whole days before, truncated to the same elapsed
    // time so a partial today is never compared against a full day.
    expect(w7.previousStartIso).toBe("2026-07-10T03:00:00.000Z");
    expect(w7.previousEndIso).toBe("2026-07-16T12:00:00.000Z");

    const w30 = resolveSellerPeriod("30d", "2026-07-23T12:00:00.000Z");
    expect(w30.label).toBe("30 dias");
    expect(w30.startIso).toBe("2026-06-24T03:00:00.000Z");
    expect(w30.previousStartIso).toBe("2026-05-25T03:00:00.000Z");
  });

  it("spans exactly N BRT calendar days for '7d'", () => {
    const w7 = resolveSellerPeriod("7d", "2026-07-23T12:00:00.000Z");
    const dayKeys = new Set<string>();
    const DAY_MS = 24 * 60 * 60 * 1000;
    for (let t = new Date(w7.startIso).getTime(); t <= new Date(w7.endIso).getTime(); t += DAY_MS) {
      dayKeys.add(new Date(t - 3 * 60 * 60 * 1000).toISOString().slice(0, 10));
    }
    expect(dayKeys.size).toBe(7);
  });
});
