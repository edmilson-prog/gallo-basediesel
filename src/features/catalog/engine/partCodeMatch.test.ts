import { describe, expect, it } from "vitest";
import type { IPart } from "@/shared/types";
import { findDuplicateByCode } from "./partCodeMatch";

function part(patch: Partial<IPart> = {}): IPart {
  return {
    id: "p1",
    sku: "1201",
    name: "Filtro de ar MANN C20500",
    oemCodes: ["C20500", "81.08405-0021"],
    equivalentPartIds: [],
    applications: [],
    brand: "MANN",
    supplier: "MANN",
    unitCost: 98.4,
    unitPrice: 189.9,
    marginPercent: 0.93,
    stockAvailable: 6,
    stockMinimum: 4,
    division: "parts",
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...patch,
  } as IPart;
}

describe("findDuplicateByCode", () => {
  it("matches an OEM code exactly", () => {
    expect(findDuplicateByCode([part()], "C20500")?.id).toBe("p1");
  });

  it("ignores case and surrounding whitespace", () => {
    expect(findDuplicateByCode([part()], "  c20500 ")?.id).toBe("p1");
  });

  it("matches the internal SKU", () => {
    expect(findDuplicateByCode([part()], "1201")?.id).toBe("p1");
  });

  it("matches a competitor cross-reference code", () => {
    const p = part({ crossReferences: [{ brand: "Fleetguard", code: "AF25065" }] });
    expect(findDuplicateByCode([p], "AF25065")?.id).toBe("p1");
  });

  it("matches a code that only survives inside the raw imported name", () => {
    const raw = part({ sku: "6257", name: "00313366 — UFI", oemCodes: [] });
    expect(findDuplicateByCode([raw], "00313366")?.id).toBe("p1");
  });

  it("does not match a code that is merely a substring of a longer one", () => {
    expect(findDuplicateByCode([part()], "C205")).toBeNull();
  });

  it("does not match a partial SKU", () => {
    expect(findDuplicateByCode([part()], "120")).toBeNull();
  });

  it("ignores codes shorter than the lookup floor", () => {
    expect(findDuplicateByCode([part({ sku: "12", oemCodes: [] })], "12")).toBeNull();
  });

  it("returns null when nothing matches", () => {
    expect(findDuplicateByCode([part()], "8PK1220")).toBeNull();
  });

  it("returns null for an empty candidate list", () => {
    expect(findDuplicateByCode([], "C20500")).toBeNull();
  });

  it("skips the part being edited", () => {
    expect(findDuplicateByCode([part()], "C20500", "p1")).toBeNull();
  });

  it("returns the first match when several parts carry the code", () => {
    const other = part({ id: "p2", sku: "9999", oemCodes: ["C20500"] });
    expect(findDuplicateByCode([part(), other], "C20500")?.id).toBe("p1");
  });
});
