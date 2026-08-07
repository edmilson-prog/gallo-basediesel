import { describe, expect, it } from "vitest";
import { aggregateWalletStats } from "./_walletAggregate";

/** Fixed clock so "30 days ago" and "this month" never drift with the calendar. */
const NOW = new Date("2026-08-06T12:00:00.000Z");

describe("aggregateWalletStats", () => {
  it("splits owned customers from the ones with no wallet owner", () => {
    const stats = aggregateWalletStats(
      [
        { sellerId: "s1", lastPurchaseAt: "2026-08-01T10:00:00.000Z" },
        { sellerId: "s1", lastPurchaseAt: "2026-08-02T10:00:00.000Z" },
        { sellerId: null, lastPurchaseAt: "2026-08-02T10:00:00.000Z" },
        { sellerId: null },
      ],
      NOW,
    );

    expect(stats.total).toBe(4);
    expect(stats.unassigned).toBe(2);
    expect(stats.bySeller).toEqual([{ sellerId: "s1", customers: 2, stale: 0, positivados: 2 }]);
  });

  it("counts a customer with no purchase at all as stale", () => {
    const stats = aggregateWalletStats(
      [{ sellerId: "s1" }, { sellerId: "s1", lastPurchaseAt: null }],
      NOW,
    );

    expect(stats.bySeller[0]).toEqual({ sellerId: "s1", customers: 2, stale: 2, positivados: 0 });
  });

  it("puts the 30-day boundary between day 29 and day 31", () => {
    const stats = aggregateWalletStats(
      [
        { sellerId: "s1", lastPurchaseAt: "2026-07-08T12:00:00.000Z" }, // 29 days ago
        { sellerId: "s1", lastPurchaseAt: "2026-07-06T12:00:00.000Z" }, // 31 days ago
      ],
      NOW,
    );

    expect(stats.bySeller[0]?.stale).toBe(1);
  });

  it("scores positivação by calendar month, not by a rolling 30-day window", () => {
    const stats = aggregateWalletStats(
      [
        { sellerId: "s1", lastPurchaseAt: "2026-08-01T09:00:00.000Z" }, // this month
        { sellerId: "s1", lastPurchaseAt: "2026-07-31T09:00:00.000Z" }, // last month, still recent
        { sellerId: "s1", lastPurchaseAt: "2025-08-04T09:00:00.000Z" }, // same month, prior year
      ],
      NOW,
    );

    expect(stats.bySeller[0]).toEqual({ sellerId: "s1", customers: 3, stale: 1, positivados: 1 });
  });

  it("orders sellers by wallet size, heaviest first", () => {
    const stats = aggregateWalletStats(
      [
        { sellerId: "small" },
        { sellerId: "big" },
        { sellerId: "big" },
        { sellerId: "mid" },
        { sellerId: "big" },
        { sellerId: "mid" },
      ],
      NOW,
    );

    expect(stats.bySeller.map((s) => s.sellerId)).toEqual(["big", "mid", "small"]);
  });

  it("treats an unparseable timestamp as no purchase instead of throwing", () => {
    const stats = aggregateWalletStats([{ sellerId: "s1", lastPurchaseAt: "not-a-date" }], NOW);

    expect(stats.bySeller[0]).toEqual({ sellerId: "s1", customers: 1, stale: 1, positivados: 0 });
  });

  it("returns an empty board for an empty store", () => {
    expect(aggregateWalletStats([], NOW)).toEqual({ total: 0, unassigned: 0, bySeller: [] });
  });
});
