import { describe, it, expect } from "vitest";
import { copyValue, copyCode, copyFullSheet } from "./partCopy";
import type { IPart } from "@/shared/types";

const part: IPart = {
  id: "p1", sku: "21707133", name: "Filtro de óleo Scania DC13",
  oemCodes: ["1774715", "2036249"], equivalentPartIds: [],
  applications: [{ id: "a1", vehicleBrand: "Scania", vehicleModel: "R450", yearStart: 2017, yearEnd: 2022, engine: "DC13" }],
  brand: "Mahle", supplier: "Mahle", unitCost: 120, unitPrice: 189.9, marginPercent: 0.58,
  reference: "5805541", stockAvailable: 42, stockMinimum: 2, division: "parts",
  active: true, createdAt: "x", updatedAt: "x",
};

describe("partCopy", () => {
  it("copyValue returns BRL price", () => {
    expect(copyValue(part)).toBe("R$ 189,90");
  });
  it("copyValue degrades to 'Sob consulta' when zero", () => {
    expect(copyValue({ ...part, unitPrice: 0 })).toBe("Sob consulta");
  });
  it("copyCode joins sku and oem codes", () => {
    expect(copyCode(part)).toBe("21707133 · 1774715 · 2036249");
  });
  it("copyFullSheet includes application and never cost", () => {
    const s = copyFullSheet(part);
    expect(s).toContain("Scania R450");
    expect(s).not.toContain("120");
  });
});
