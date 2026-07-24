import { describe, expect, it } from "vitest";
import { resolveSellerPeriod } from "./period";

describe("resolveSellerPeriod", () => {
  it("resolves 'hoje' as the BRT calendar day (00:00 BRT to now), with the full previous BRT day before it", () => {
    const w = resolveSellerPeriod("hoje", "2026-07-23T17:00:00.000Z"); // 14h BRT
    expect(w.label).toBe("Hoje");
    expect(w.startIso).toBe("2026-07-23T03:00:00.000Z"); // 00:00 BRT = 03:00 UTC
    expect(w.endIso).toBe("2026-07-23T17:00:00.000Z");
    expect(w.previousStartIso).toBe("2026-07-22T03:00:00.000Z"); // 00:00 BRT the day before
    expect(w.previousEndIso).toBe(w.startIso);
  });

  it("keeps 'hoje' anchored to the same BRT day just after midnight", () => {
    const w2 = resolveSellerPeriod("hoje", "2026-07-23T03:30:00.000Z"); // 00:30 BRT
    expect(w2.startIso).toBe("2026-07-23T03:00:00.000Z");
    expect(w2.endIso).toBe("2026-07-23T03:30:00.000Z");
  });

  it("resolves '7d' and '30d' as rolling windows with matching-length previous windows", () => {
    const w7 = resolveSellerPeriod("7d", "2026-07-23T12:00:00.000Z");
    expect(w7.label).toBe("7 dias");
    expect(w7.startIso).toBe("2026-07-16T12:00:00.000Z");
    expect(w7.previousStartIso).toBe("2026-07-09T12:00:00.000Z");

    const w30 = resolveSellerPeriod("30d", "2026-07-23T12:00:00.000Z");
    expect(w30.label).toBe("30 dias");
    expect(w30.startIso).toBe("2026-06-23T12:00:00.000Z");
  });
});
