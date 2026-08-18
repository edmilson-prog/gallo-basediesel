import { describe, expect, it } from "vitest";
import { allocateCharges } from "./costAllocation";

describe("allocateCharges", () => {
  it("splits charges proportionally to each item's value (RC-01)", () => {
    const result = allocateCharges({
      items: [
        { id: "a", totalValue: 1396.8 },
        { id: "b", totalValue: 1556.0 },
      ],
      freight: 182.2,
      ipi: 214.9,
      discount: 0,
    });
    // total de encargos 397.10; produtos 2952.80
    expect(result.get("a")).toBeCloseTo(397.1 * (1396.8 / 2952.8), 6);
    expect(result.get("b")).toBeCloseTo(397.1 * (1556.0 / 2952.8), 6);
  });

  it("conserves the total charge across items", () => {
    const result = allocateCharges({
      items: [
        { id: "a", totalValue: 100 },
        { id: "b", totalValue: 200 },
        { id: "c", totalValue: 700 },
      ],
      freight: 90,
      ipi: 10,
      discount: 0,
    });
    const sum = [...result.values()].reduce((a, v) => a + v, 0);
    expect(sum).toBeCloseTo(100, 6);
  });

  it("subtracts the discount, which can make the allocation negative", () => {
    const result = allocateCharges({
      items: [{ id: "a", totalValue: 100 }],
      freight: 10,
      ipi: 0,
      discount: 30,
    });
    expect(result.get("a")).toBeCloseTo(-20, 6);
  });

  it("allocates zero to every item when there is no charge", () => {
    const result = allocateCharges({
      items: [
        { id: "a", totalValue: 100 },
        { id: "b", totalValue: 300 },
      ],
      freight: 0,
      ipi: 0,
      discount: 0,
    });
    expect(result.get("a")).toBe(0);
    expect(result.get("b")).toBe(0);
  });

  it("allocates zero when the product total is zero, instead of dividing by zero", () => {
    const result = allocateCharges({
      items: [{ id: "a", totalValue: 0 }],
      freight: 50,
      ipi: 0,
      discount: 0,
    });
    expect(result.get("a")).toBe(0);
  });

  it("returns an empty map for an empty item list", () => {
    expect(allocateCharges({ items: [], freight: 10, ipi: 0, discount: 0 }).size).toBe(0);
  });
});
