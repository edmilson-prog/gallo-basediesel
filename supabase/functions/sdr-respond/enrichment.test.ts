import { describe, expect, it } from "vitest";
import { computeCustomerEnrichmentPatch } from "./enrichment";

describe("computeCustomerEnrichmentPatch", () => {
  it("fills both fields when the customer record is empty", () => {
    const patch = computeCustomerEnrichmentPatch(
      { name: null, city: null },
      { preferredName: "João", location: "Frederico Westphalen" },
    );
    expect(patch).toEqual({ name: "João", city: "Frederico Westphalen" });
  });

  it("never overwrites an existing name", () => {
    const patch = computeCustomerEnrichmentPatch(
      { name: "João da Frota Express", city: null },
      { preferredName: "Jota", location: "Passo Fundo" },
    );
    expect(patch.name).toBeUndefined();
    expect(patch.city).toBe("Passo Fundo");
  });

  it("never overwrites an existing city", () => {
    const patch = computeCustomerEnrichmentPatch(
      { name: null, city: "Frederico Westphalen" },
      { preferredName: "Maria", location: "Erechim" },
    );
    expect(patch.city).toBeUndefined();
    expect(patch.name).toBe("Maria");
  });

  it("treats a whitespace-only current name as empty", () => {
    const patch = computeCustomerEnrichmentPatch(
      { name: "   ", city: null },
      { preferredName: "Carlos" },
    );
    expect(patch.name).toBe("Carlos");
  });

  it("returns an empty patch when nothing was collected", () => {
    const patch = computeCustomerEnrichmentPatch({ name: null, city: null }, {});
    expect(patch).toEqual({});
  });

  it("returns an empty patch when everything is already filled", () => {
    const patch = computeCustomerEnrichmentPatch(
      { name: "João", city: "Frederico Westphalen" },
      { preferredName: "Jota", location: "Erechim" },
    );
    expect(patch).toEqual({});
  });
});
