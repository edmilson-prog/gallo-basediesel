import { describe, expect, it } from "vitest";
import { canonicalSupplierName, normalizeSupplierName, supplierNameMatches } from "./supplierName";

describe("normalizeSupplierName", () => {
  it("lowercases, strips accents and collapses whitespace", () => {
    expect(normalizeSupplierName("  POTTER  &amp;  HOPPE  INJECAO  ")).toBe(
      "potter & hoppe injecao",
    );
  });

  it("decodes the &amp; entity left by the DINTEC import", () => {
    expect(normalizeSupplierName("POTTER &amp; HOPPE")).toBe("potter & hoppe");
  });

  it("treats accented and unaccented spellings as the same name", () => {
    expect(normalizeSupplierName("Sabó Vedações")).toBe(normalizeSupplierName("SABO VEDACOES"));
  });

  it("drops the trailing company suffix so LTDA does not split a supplier", () => {
    expect(normalizeSupplierName("RETIFICA LC LTDA")).toBe("retifica lc");
    expect(normalizeSupplierName("Vale S.A.")).toBe("vale");
  });
});

describe("canonicalSupplierName", () => {
  it("rejects the DINTEC placeholder", () => {
    expect(canonicalSupplierName("Não informado")).toBeNull();
    expect(canonicalSupplierName("NAO INFORMADO")).toBeNull();
  });

  it("rejects empty and whitespace-only names", () => {
    expect(canonicalSupplierName("   ")).toBeNull();
    expect(canonicalSupplierName("")).toBeNull();
  });

  it("collapses the known alias to a single supplier", () => {
    expect(canonicalSupplierName("UFI")).toBe("UFI Filters");
    expect(canonicalSupplierName("UFI Filters")).toBe("UFI Filters");
  });

  it("title-cases an all-caps name and keeps the ampersand", () => {
    expect(canonicalSupplierName("POTTER &amp; HOPPE INJECAO ELETRONICA LTDA")).toBe(
      "Potter & Hoppe Injecao Eletronica Ltda",
    );
  });

  it("leaves an already well-formed name alone", () => {
    expect(canonicalSupplierName("Pako Distribuidora de Auto Pecas Ltda")).toBe(
      "Pako Distribuidora de Auto Pecas Ltda",
    );
  });
});

describe("supplierNameMatches", () => {
  it("matches across case, accent and suffix differences", () => {
    expect(supplierNameMatches("RETIFICA LC LTDA", "Retífica LC")).toBe(true);
  });

  it("does not match two genuinely different suppliers", () => {
    expect(supplierNameMatches("Tecfil", "Fleetguard")).toBe(false);
  });
});
