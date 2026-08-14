import { describe, expect, it } from "vitest";
import type { IApplication, IPart } from "@/shared/types";
import {
  COVERAGE_BUCKETS,
  countCoverage,
  isCoverageBucket,
  isDeadStockCandidate,
  isReadyToSell,
  matchesCoverage,
  missingFields,
  needsRestock,
} from "./completeness";

function makeApplication(overrides: Partial<IApplication> = {}): IApplication {
  return {
    id: "app-1",
    vehicleBrand: "VOLVO",
    vehicleModel: "FH 460",
    yearStart: 2018,
    yearEnd: 2024,
    ...overrides,
  };
}

/** A fully enriched part — every test starts from "complete" and removes fields. */
function makePart(overrides: Partial<IPart> = {}): IPart {
  return {
    id: "part-1",
    sku: "1201",
    name: "Filtro de ar MANN C20500",
    oemCodes: ["81.08405-0021"],
    equivalentPartIds: [],
    applications: [makeApplication()],
    brand: "MANN FILTER",
    supplier: "SCHERER S/A",
    category: "filtro",
    unitCost: 98.4,
    unitPrice: 189.9,
    marginPercent: 0.8,
    stockAvailable: 6,
    stockMinimum: 4,
    division: "parts",
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("missingFields", () => {
  it("returns nothing for a fully filled record", () => {
    expect(missingFields(makePart())).toEqual([]);
  });

  it("reports each empty field in canonical order", () => {
    const raw = makePart({
      category: undefined,
      brand: "",
      oemCodes: [],
      applications: [],
      unitCost: 0,
    });
    expect(missingFields(raw)).toEqual(["category", "manufacturer", "oem", "application", "cost"]);
  });

  it("treats a whitespace-only manufacturer as missing", () => {
    expect(missingFields(makePart({ brand: "   " }))).toContain("manufacturer");
  });

  it("treats a zero cost as missing, not as free", () => {
    expect(missingFields(makePart({ unitCost: 0 }))).toContain("cost");
  });
});

describe("isReadyToSell", () => {
  it("accepts a complete record", () => {
    expect(isReadyToSell(makePart())).toBe(true);
  });

  it("accepts a part findable by OEM alone", () => {
    expect(isReadyToSell(makePart({ applications: [] }))).toBe(true);
  });

  it("accepts a part findable by application alone", () => {
    expect(isReadyToSell(makePart({ oemCodes: [] }))).toBe(true);
  });

  it("rejects a part that is neither findable by OEM nor by application", () => {
    expect(isReadyToSell(makePart({ oemCodes: [], applications: [] }))).toBe(false);
  });

  it.each([
    ["category", { category: undefined }],
    ["manufacturer", { brand: "" }],
    ["cost", { unitCost: 0 }],
  ] as const)("rejects a part missing its %s", (_label, patch) => {
    expect(isReadyToSell(makePart(patch))).toBe(false);
  });
});

describe("needsRestock", () => {
  it("flags a zeroed part that declares a minimum", () => {
    expect(needsRestock(makePart({ stockAvailable: 0, stockMinimum: 4 }))).toBe(true);
  });

  it("ignores a zeroed part with no minimum — nobody set a target", () => {
    expect(needsRestock(makePart({ stockAvailable: 0, stockMinimum: 0 }))).toBe(false);
  });

  it("ignores parts that still have stock", () => {
    expect(needsRestock(makePart({ stockAvailable: 2, stockMinimum: 4 }))).toBe(false);
  });

  it("ignores inactive parts", () => {
    expect(needsRestock(makePart({ active: false, stockAvailable: 0, stockMinimum: 4 }))).toBe(
      false,
    );
  });
});

describe("isDeadStockCandidate", () => {
  const abandoned = makePart({
    category: undefined,
    brand: "",
    oemCodes: [],
    applications: [],
    unitCost: 0,
    stockAvailable: 0,
    stockMinimum: 0,
  });

  it("flags an abandoned, never-sold, zeroed part", () => {
    expect(isDeadStockCandidate(abandoned, 0)).toBe(true);
  });

  it("never fires while turnover is unknown", () => {
    expect(isDeadStockCandidate(abandoned, null)).toBe(false);
  });

  it("does not flag a part that has sold", () => {
    expect(isDeadStockCandidate(abandoned, 3)).toBe(false);
  });

  it("does not flag a part whose record is mostly filled", () => {
    expect(isDeadStockCandidate(makePart({ stockAvailable: 0 }), 0)).toBe(false);
  });
});

describe("matchesCoverage", () => {
  it("lets everything through the `all` bucket", () => {
    expect(matchesCoverage(makePart({ category: undefined }), "all")).toBe(true);
  });

  it("selects uncategorised parts", () => {
    expect(matchesCoverage(makePart({ category: undefined }), "noCategory")).toBe(true);
    expect(matchesCoverage(makePart(), "noCategory")).toBe(false);
  });

  it("selects parts without a cost", () => {
    expect(matchesCoverage(makePart({ unitCost: 0 }), "noCost")).toBe(true);
  });
});

describe("countCoverage", () => {
  it("counts every bucket in one pass", () => {
    const counts = countCoverage([
      makePart({ id: "a" }),
      makePart({ id: "b", category: undefined, oemCodes: [], unitCost: 0 }),
      makePart({ id: "c", applications: [], stockAvailable: 0, stockMinimum: 4 }),
    ]);
    expect(counts).toEqual({
      all: 3,
      ready: 2, // a (complete) and c (OEM makes it findable)
      noCategory: 1,
      noOem: 1,
      noApplication: 1,
      noCost: 1,
      restock: 1,
    });
  });

  it("returns zeros for an empty catalog", () => {
    expect(countCoverage([])).toEqual({
      all: 0,
      ready: 0,
      noCategory: 0,
      noOem: 0,
      noApplication: 0,
      noCost: 0,
      restock: 0,
    });
  });

  it("covers every declared bucket", () => {
    const counts = countCoverage([makePart()]);
    for (const bucket of COVERAGE_BUCKETS) {
      expect(counts[bucket.id]).toBeTypeOf("number");
    }
  });
});

describe("isCoverageBucket", () => {
  it("accepts declared buckets and rejects anything else", () => {
    expect(isCoverageBucket("restock")).toBe(true);
    expect(isCoverageBucket("nope")).toBe(false);
    expect(isCoverageBucket(undefined)).toBe(false);
  });
});
