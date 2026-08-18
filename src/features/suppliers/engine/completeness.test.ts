import { describe, expect, it } from "vitest";
import type { ISupplier } from "@/shared/types";
import { supplierCompleteness } from "./completeness";

function make(patch: Partial<ISupplier> = {}): ISupplier {
  return {
    id: "s1",
    storeId: "store-1",
    name: "Tecfil",
    category: "parts",
    suppliedItems: [],
    status: "active",
    source: "catalog_backfill",
    createdAt: "2026-08-17T12:00:00.000Z",
    updatedAt: "2026-08-17T12:00:00.000Z",
    ...patch,
  };
}

describe("supplierCompleteness", () => {
  it("counts a bare backfilled record as nothing filled", () => {
    const result = supplierCompleteness(make());
    expect(result.filled).toBe(0);
    expect(result.total).toBe(5);
    expect(result.percent).toBe(0);
  });

  it("lists what is missing in the order the form asks for it", () => {
    const result = supplierCompleteness(make());
    expect(result.missing).toEqual([
      "document",
      "paymentTerms",
      "leadTimeDays",
      "contact",
      "suppliedItems",
    ]);
  });

  it("counts a fully filled record as complete", () => {
    const result = supplierCompleteness(
      make({
        document: "33000167000101",
        paymentTerms: "28 dias",
        leadTimeDays: 5,
        contactPhone: "5433218800",
        suppliedItems: ["Filtros"],
      }),
    );
    expect(result.filled).toBe(5);
    expect(result.percent).toBe(100);
    expect(result.missing).toEqual([]);
  });

  it("accepts either contact name or phone as the contact", () => {
    const result = supplierCompleteness(make({ contactName: "Ana Petry" }));
    expect(result.missing).not.toContain("contact");
  });

  it("falls back to phone when the contact name was cleared to an empty string", () => {
    // Regression: `??` does not fall through on `""`, only on
    // null/undefined, so a cleared name used to mask a real phone and read
    // as "sem contato" even though the supplier has one.
    const result = supplierCompleteness(make({ contactName: "", contactPhone: "5433218800" }));
    expect(result.missing).not.toContain("contact");
  });

  it("counts an explicit leadTimeDays of 0 as filled, not missing", () => {
    // Regression: `> 0` treated a legitimate same-day lead time (the
    // migration allows `>= 0`, e.g. the seeded `sup-cresol`) as absent.
    const result = supplierCompleteness(make({ leadTimeDays: 0 }));
    expect(result.missing).not.toContain("leadTimeDays");
  });

  it("still counts an absent leadTimeDays as missing", () => {
    const result = supplierCompleteness(make({ leadTimeDays: undefined }));
    expect(result.missing).toContain("leadTimeDays");
  });

  it("does not count an empty suppliedItems array as filled", () => {
    const result = supplierCompleteness(make({ suppliedItems: [] }));
    expect(result.missing).toContain("suppliedItems");
  });

  it("rounds the percent to an integer", () => {
    const result = supplierCompleteness(make({ document: "33000167000101" }));
    expect(result.percent).toBe(20);
  });
});
