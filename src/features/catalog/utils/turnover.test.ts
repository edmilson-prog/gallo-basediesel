import { describe, expect, it } from "vitest";
import type { IOrder, IOrderItem } from "@/shared/types";
import { buildTurnoverIndex, isPaidOrder, turnoverFor, turnoverWindowStart } from "./turnover";

function makeItem(overrides: Partial<IOrderItem> = {}): IOrderItem {
  return {
    id: "item-1",
    partId: "part-1",
    partSku: "1201",
    partName: "Filtro de ar MANN C20500",
    quantity: 2,
    unitPrice: 189.9,
    unitCost: 98.4,
    discount: 0,
    total: 379.8,
    marginValue: 183,
    ...overrides,
  };
}

function makeOrder(overrides: Partial<IOrder> = {}): IOrder {
  return {
    id: "order-1",
    storeId: "store-1",
    customerId: "customer-1",
    sellerId: "seller-1",
    items: [makeItem()],
    subtotal: 379.8,
    discount: 0,
    shipping: 0,
    total: 379.8,
    paymentCondition: "à vista",
    paymentStatus: "pago",
    fulfillmentStatus: "entregue",
    origin: "manual",
    division: "parts",
    paidAt: "2026-07-01T00:00:00.000Z",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

const WINDOW_START = new Date("2026-01-01T00:00:00.000Z").getTime();

describe("isPaidOrder", () => {
  it("counts paid and partially paid orders", () => {
    expect(isPaidOrder({ paymentStatus: "pago" })).toBe(true);
    expect(isPaidOrder({ paymentStatus: "parcial" })).toBe(true);
  });

  it("ignores orders that were never paid", () => {
    expect(isPaidOrder({ paymentStatus: "pendente" })).toBe(false);
  });
});

describe("turnoverWindowStart", () => {
  it("walks back the requested number of days", () => {
    expect(turnoverWindowStart(new Date("2026-08-14T00:00:00.000Z"), 365)).toBe(
      "2025-08-14T00:00:00.000Z",
    );
  });
});

describe("buildTurnoverIndex", () => {
  it("sums units per part across orders", () => {
    const index = buildTurnoverIndex(
      [
        makeOrder({ id: "a", items: [makeItem({ quantity: 2 })] }),
        makeOrder({ id: "b", items: [makeItem({ quantity: 3 })] }),
      ],
      WINDOW_START,
    );
    expect(index.get("part-1")?.units).toBe(5);
  });

  it("keeps parts separate", () => {
    const index = buildTurnoverIndex(
      [
        makeOrder({
          items: [
            makeItem({ partId: "part-1", quantity: 2 }),
            makeItem({ partId: "part-2", quantity: 7 }),
          ],
        }),
      ],
      WINDOW_START,
    );
    expect(index.get("part-1")?.units).toBe(2);
    expect(index.get("part-2")?.units).toBe(7);
  });

  it("skips orders that were never paid", () => {
    const index = buildTurnoverIndex([makeOrder({ paymentStatus: "pendente" })], WINDOW_START);
    expect(index.size).toBe(0);
  });

  it("excludes units sold before the window but still records the last sale", () => {
    const index = buildTurnoverIndex(
      [makeOrder({ paidAt: "2024-03-05T00:00:00.000Z", items: [makeItem({ quantity: 4 })] })],
      WINDOW_START,
    );
    expect(index.get("part-1")).toEqual({ units: 0, lastSaleAt: "2024-03-05T00:00:00.000Z" });
  });

  it("keeps the most recent sale date", () => {
    const index = buildTurnoverIndex(
      [
        makeOrder({ id: "a", paidAt: "2026-02-10T00:00:00.000Z" }),
        makeOrder({ id: "b", paidAt: "2026-07-22T00:00:00.000Z" }),
        makeOrder({ id: "c", paidAt: "2026-05-01T00:00:00.000Z" }),
      ],
      WINDOW_START,
    );
    expect(index.get("part-1")?.lastSaleAt).toBe("2026-07-22T00:00:00.000Z");
  });

  it("falls back to updatedAt when paidAt is absent", () => {
    const index = buildTurnoverIndex(
      [makeOrder({ paidAt: undefined, updatedAt: "2026-06-30T00:00:00.000Z" })],
      WINDOW_START,
    );
    expect(index.get("part-1")?.lastSaleAt).toBe("2026-06-30T00:00:00.000Z");
  });

  it("ignores unparseable timestamps", () => {
    const index = buildTurnoverIndex(
      [makeOrder({ paidAt: "not-a-date", updatedAt: "not-a-date" })],
      WINDOW_START,
    );
    expect(index.size).toBe(0);
  });
});

describe("turnoverFor", () => {
  it("returns null when the index is absent — unknown is not zero", () => {
    expect(turnoverFor(null, "part-1")).toBeNull();
    expect(turnoverFor(undefined, "part-1")).toBeNull();
  });

  it("returns an explicit zero for a part missing from a loaded index", () => {
    expect(turnoverFor(new Map(), "part-1")).toEqual({ units: 0, lastSaleAt: null });
  });
});
