import { describe, it, expect } from "vitest";
import { buildPartInsertText, appendToDraft } from "./partInsertText";
import type { IPart } from "@/shared/types";

const base: IPart = {
  id: "p1", sku: "21707133", name: "Filtro de óleo Scania DC13",
  oemCodes: ["1774715", "2036249"], equivalentPartIds: [], applications: [],
  brand: "Mahle", supplier: "Mahle", unitCost: 120, unitPrice: 189.9,
  marginPercent: 0.58, reference: "5805541", stockAvailable: 42, stockMinimum: 2,
  division: "parts", active: true, createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

describe("buildPartInsertText", () => {
  it("formats name in bold with code, reference, price and stock", () => {
    const t = buildPartInsertText(base);
    expect(t).toContain("*Filtro de óleo Scania DC13*");
    expect(t).toContain("Código: 21707133");
    expect(t).toContain("Ref.: 5805541");
    expect(t).toContain("R$ 189,90");
    expect(t).toContain("42 un");
  });

  it("degrades missing price to 'Sob consulta', never R$ 0,00", () => {
    const t = buildPartInsertText({ ...base, unitPrice: 0 });
    expect(t).toContain("Sob consulta");
    expect(t).not.toContain("0,00");
  });

  it("omits reference when absent", () => {
    const t = buildPartInsertText({ ...base, reference: undefined });
    expect(t).not.toContain("Ref.:");
  });

  it("never leaks cost or margin", () => {
    const t = buildPartInsertText(base);
    expect(t).not.toContain("120");
    expect(t).not.toContain("margem");
    expect(t.toLowerCase()).not.toContain("custo");
  });

  it("shows 'sob consulta' stock when out of stock", () => {
    const t = buildPartInsertText({ ...base, stockAvailable: 0 });
    expect(t).toContain("Disp.: sob consulta");
  });
});

describe("appendToDraft", () => {
  it("returns the text when draft is empty", () => {
    expect(appendToDraft("", "novo")).toBe("novo");
    expect(appendToDraft("   ", "novo")).toBe("novo");
  });
  it("appends with a blank line, preserving existing draft", () => {
    expect(appendToDraft("oi", "peça")).toBe("oi\n\npeça");
  });
});
