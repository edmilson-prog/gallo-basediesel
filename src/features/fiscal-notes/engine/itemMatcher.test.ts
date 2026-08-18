import { describe, expect, it } from "vitest";
import { matchItem, tokenize, type IMatchCandidate } from "./itemMatcher";

const CANDIDATES: IMatchCandidate[] = [
  {
    partId: "p-r60t",
    sku: "FLT-R60T",
    name: "Filtro separador Racor R60T",
    ncm: "84212300",
    ean: "7891234567895",
  },
  {
    partId: "p-bico",
    sku: "BIC-0445120212",
    name: "Bico injetor Bosch CR 0445120212",
    ncm: "84099190",
    ean: "7899999000012",
  },
  {
    partId: "p-arla",
    sku: "ARL-B20",
    name: "Arla 32 bombona 20 L",
    ncm: "31021010",
  },
];

describe("tokenize", () => {
  it("uppercases, strips accents and drops noise tokens", () => {
    // "de" e "CX" caem no filtro de ruído; "12" sobrevive de propósito.
    // Filtrar dígitos curtos perderia sinal legítimo — "32" em "Arla 32" e
    // "20" em "bombona 20 L" são nome e especificação, não embalagem.
    expect(tokenize("Filtro separador de Água R60T CX C/12")).toEqual([
      "FILTRO",
      "SEPARADOR",
      "AGUA",
      "R60T",
      "12",
    ]);
  });

  it("keeps a short numeric token that is part of the product name", () => {
    expect(tokenize("Arla 32 bombona 20 L")).toEqual(["ARLA", "32", "BOMBONA", "20"]);
  });
});

describe("matchItem", () => {
  it("links directly when the supplier code is already mapped", () => {
    const r = matchItem(
      { supplierCode: "RC-R60T", description: "QUALQUER COISA", mappedPartId: "p-r60t" },
      CANDIDATES,
    );
    expect(r.mode).toBe("auto");
    expect(r.partId).toBe("p-r60t");
    expect(r.confidence).toBeNull();
    // A evidência nomeia o código, para o conferente saber qual par foi
    // aprendido — não basta dizer que existe mapeamento.
    expect(r.evidence).toContain("RC-R60T");
    expect(r.evidence).toMatch(/já mapeado/i);
  });

  it("suggests with very high confidence on an identical EAN", () => {
    const r = matchItem(
      { supplierCode: "X", description: "PECA SEM NOME PARECIDO", ean: "7899999000012" },
      CANDIDATES,
    );
    expect(r.mode).toBe("ia");
    expect(r.partId).toBe("p-bico");
    expect(r.confidence).toBeGreaterThanOrEqual(95);
    expect(r.evidence).toMatch(/EAN idêntico/i);
  });

  it("suggests on matching NCM plus strong description overlap", () => {
    const r = matchItem(
      {
        supplierCode: "RC-R60T",
        description: "FILTRO SEPARADOR RACOR R60T CX C/12",
        ncm: "84212300",
      },
      CANDIDATES,
    );
    expect(r.mode).toBe("ia");
    expect(r.partId).toBe("p-r60t");
    expect(r.confidence).toBeGreaterThanOrEqual(80);
    expect(r.confidence).toBeLessThanOrEqual(94);
    expect(r.evidence).toMatch(/NCM igual/i);
  });

  it("suggests with lower confidence when the description matches but the NCM differs", () => {
    const r = matchItem(
      {
        supplierCode: "RC-R60T",
        description: "FILTRO SEPARADOR RACOR R60T",
        ncm: "99999999",
      },
      CANDIDATES,
    );
    expect(r.mode).toBe("ia");
    expect(r.partId).toBe("p-r60t");
    expect(r.confidence).toBeGreaterThanOrEqual(60);
    expect(r.confidence).toBeLessThan(80);
    expect(r.evidence).toMatch(/NCM difere/i);
  });

  it("falls through to pending when nothing matches", () => {
    const r = matchItem(
      { supplierCode: "ZZ-999", description: "PARAFUSO SEXTAVADO M8", ncm: "73181500" },
      CANDIDATES,
    );
    expect(r.mode).toBe("pend");
    expect(r.partId).toBeNull();
    expect(r.confidence).toBeNull();
  });

  it("falls through to pending when there are no candidates at all", () => {
    expect(
      matchItem({ supplierCode: "A", description: "FILTRO SEPARADOR RACOR R60T" }, []).mode,
    ).toBe("pend");
  });

  it("prefers EAN over description when both would match different parts", () => {
    const r = matchItem(
      {
        supplierCode: "X",
        description: "FILTRO SEPARADOR RACOR R60T",
        ncm: "84212300",
        ean: "7899999000012",
      },
      CANDIDATES,
    );
    expect(r.partId).toBe("p-bico");
  });

  it("ignores an EAN that no candidate has", () => {
    const r = matchItem(
      {
        supplierCode: "X",
        description: "FILTRO SEPARADOR RACOR R60T",
        ncm: "84212300",
        ean: "0000000000000",
      },
      CANDIDATES,
    );
    expect(r.partId).toBe("p-r60t");
  });
});
