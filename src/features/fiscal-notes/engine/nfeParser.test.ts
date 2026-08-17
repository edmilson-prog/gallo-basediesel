import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NfeParseError, parseNfe } from "./nfeParser";

const XML = readFileSync(join(__dirname, "__fixtures__", "nfe-dieseltec.xml"), "utf8");

describe("parseNfe", () => {
  it("reads the note header", () => {
    const nfe = parseNfe(XML);
    expect(nfe.accessKey).toBe("35260804887213000190550010000301291000301298");
    expect(nfe.number).toBe("30129");
    expect(nfe.series).toBe("1");
    expect(nfe.issuedAt).toBe("2026-08-14T09:12:00-03:00");
  });

  it("reads the emitter block, keeping CNPJ as digits only", () => {
    expect(parseNfe(XML).emitter).toEqual({
      cnpj: "04887213000190",
      corporateName: "DIESELTEC DISTRIBUIDORA DE AUTO PECAS LTDA",
      tradeName: "Dieseltec",
      stateRegistration: "096233148 8",
      address: "Av. Brasil Oeste, 2840 — Centro — Passo Fundo/RS",
    });
  });

  it("reads every item with the values as they came in the XML", () => {
    const items = parseNfe(XML).items;
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      seq: 1,
      supplierCode: "RC-R60T",
      description: "FILTRO SEPARADOR RACOR R60T CX C/12",
      ncm: "84212300",
      cfop: "6102",
      ean: "7891234567895",
      unit: "CX",
      quantity: 2,
      unitValue: 698.4,
      totalValue: 1396.8,
    });
  });

  it("treats 'SEM GTIN' as no EAN at all", () => {
    expect(parseNfe(XML).items[1]?.ean).toBeUndefined();
  });

  it("reads charges and totals", () => {
    const nfe = parseNfe(XML);
    expect(nfe.freight).toBe(182.2);
    expect(nfe.ipi).toBe(214.9);
    expect(nfe.discount).toBe(0);
    expect(nfe.productsTotal).toBe(2952.8);
    expect(nfe.total).toBe(3349.9);
  });

  it("reads the duplicates", () => {
    expect(parseNfe(XML).duplicates).toEqual([
      { number: "001", dueDate: "2026-09-16", amount: 1116.64 },
      { number: "002", dueDate: "2026-10-16", amount: 1116.63 },
      { number: "003", dueDate: "2026-11-16", amount: 1116.63 },
    ]);
  });

  it("rejects an XML that is not an NF-e", () => {
    expect(() => parseNfe("<html><body>nope</body></html>")).toThrow(NfeParseError);
  });

  it("rejects an NF-e whose access key fails the check digit", () => {
    const tampered = XML.replace(
      "NFe35260804887213000190550010000301291000301298",
      "NFe35260804887213000190550010000301291000301299",
    );
    expect(() => parseNfe(tampered)).toThrow(/chave de acesso/i);
  });

  it("rejects an NF-e with no items", () => {
    const noItems = XML.replace(/<det nItem="\d">[\s\S]*?<\/det>/g, "");
    expect(() => parseNfe(noItems)).toThrow(/nenhum item/i);
  });
});
