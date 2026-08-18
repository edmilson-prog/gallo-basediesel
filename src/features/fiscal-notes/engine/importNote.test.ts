import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseNfe } from "./nfeParser";
import { buildNoteFromNfe, summarizeLinks, supplierDraftFromEmitter } from "./importNote";
import type { IMatchCandidate } from "./itemMatcher";

const NFE = parseNfe(readFileSync(join(__dirname, "__fixtures__", "nfe-dieseltec.xml"), "utf8"));

const CANDIDATES: IMatchCandidate[] = [
  {
    partId: "p-r60t",
    sku: "FLT-R60T",
    name: "Filtro separador Racor R60T",
    ncm: "84212300",
    ean: "7891234567895",
  },
];

const base = {
  nfe: NFE,
  storeId: "store-1",
  supplierId: "sup-1",
  origin: "upload" as const,
  candidates: CANDIDATES,
  mappedCodes: {} as Record<string, string>,
  enteredAt: "2026-08-17T10:00:00.000Z",
};

describe("supplierDraftFromEmitter", () => {
  it("copia do XML o que o XML tem", () => {
    const draft = supplierDraftFromEmitter(NFE.emitter, "store-1");
    expect(draft.storeId).toBe("store-1");
    expect(draft.cnpj).toBe("04887213000190");
    expect(draft.corporateName).toBe("DIESELTEC DISTRIBUIDORA DE AUTO PECAS LTDA");
    expect(draft.tradeName).toBe("Dieseltec");
    expect(draft.stateRegistration).toBe("096233148 8");
    expect(draft.address).toContain("Passo Fundo/RS");
    expect(draft.active).toBe(true);
    expect(draft.createdFromXml).toBe(true);
  });

  it("deixa contato e categoria VAZIOS — não vêm no XML e não se inventa", () => {
    const draft = supplierDraftFromEmitter(NFE.emitter, "store-1");
    expect(draft.contactName).toBeUndefined();
    expect(draft.contactEmail).toBeUndefined();
    expect(draft.contactPhone).toBeUndefined();
    expect(draft.category).toBeUndefined();
  });
});

describe("buildNoteFromNfe", () => {
  it("monta o cabeçalho a partir do XML e nasce em conferência", () => {
    const note = buildNoteFromNfe(base);
    expect(note.accessKey).toBe("35260804887213000190550010000301291000301298");
    expect(note.number).toBe("30129");
    expect(note.series).toBe("1");
    expect(note.supplierId).toBe("sup-1");
    expect(note.storeId).toBe("store-1");
    expect(note.status).toBe("conferencia");
    expect(note.origin).toBe("upload");
    expect(note.division).toBe("parts");
    expect(note.enteredAt).toBe("2026-08-17T10:00:00.000Z");
  });

  it("importar NUNCA lança: nenhum item nasce confirmado", () => {
    expect(buildNoteFromNfe(base).items.every((i) => i.confirmed === false)).toBe(true);
  });

  it("copia encargos e totais sem recalcular", () => {
    const note = buildNoteFromNfe(base);
    expect(note.freight).toBe(182.2);
    expect(note.ipi).toBe(214.9);
    expect(note.discount).toBe(0);
    expect(note.productsTotal).toBe(2952.8);
    expect(note.total).toBe(3349.9);
  });

  it("traz as duplicatas do XML", () => {
    const dups = buildNoteFromNfe(base).duplicates;
    expect(dups).toHaveLength(3);
    expect(dups[0]).toEqual({ number: "001", dueDate: "2026-09-16", amount: 1116.64 });
  });

  it("aplica a sugestão da IA no item que casa, com evidência", () => {
    const item = buildNoteFromNfe(base).items.find((i) => i.supplierCode === "RC-R60T");
    expect(item?.linkMode).toBe("ia");
    expect(item?.partId).toBe("p-r60t");
    expect(item?.aiConfidence).toBeGreaterThan(0);
    expect(item?.aiEvidence).toBeTruthy();
  });

  it("deixa pendente o item sem candidato", () => {
    const item = buildNoteFromNfe(base).items.find((i) => i.supplierCode === "BI-0445120212");
    expect(item?.linkMode).toBe("pend");
    expect(item?.partId).toBeUndefined();
  });

  it("vincula direto quando o cProd já foi aprendido, sem grau de confiança", () => {
    const note = buildNoteFromNfe({ ...base, mappedCodes: { "RC-R60T": "p-r60t" } });
    const item = note.items.find((i) => i.supplierCode === "RC-R60T");
    expect(item?.linkMode).toBe("auto");
    expect(item?.partId).toBe("p-r60t");
    expect(item?.aiConfidence).toBeUndefined();
  });

  it("nasce sem fator de conversão — o fator é decisão da conferência", () => {
    for (const item of buildNoteFromNfe(base).items) {
      expect(item.conversionMode).toBe("direto");
      expect(item.conversionFactor).toBeNull();
    }
  });

  it("preserva os campos do XML sem tocar neles", () => {
    const item = buildNoteFromNfe(base).items.find((i) => i.supplierCode === "RC-R60T");
    expect(item?.description).toBe("FILTRO SEPARADOR RACOR R60T CX C/12");
    expect(item?.ncm).toBe("84212300");
    expect(item?.cfop).toBe("6102");
    expect(item?.unit).toBe("CX");
    expect(item?.quantity).toBe(2);
    expect(item?.unitValue).toBe(698.4);
    expect(item?.totalValue).toBe(1396.8);
  });

  it("guarda o caminho do XML quando arquivado", () => {
    expect(buildNoteFromNfe({ ...base, xmlPath: "store-1/chave.xml" }).xmlPath).toBe(
      "store-1/chave.xml",
    );
  });
});

describe("summarizeLinks", () => {
  it("conta os itens por tipo de vínculo", () => {
    const counts = summarizeLinks(buildNoteFromNfe(base).items);
    expect(counts.ia).toBe(1);
    expect(counts.pend).toBe(1);
    expect(counts.auto).toBe(0);
    expect(counts.novo).toBe(0);
  });

  it("devolve tudo em zero para uma nota sem itens", () => {
    expect(summarizeLinks([])).toEqual({ auto: 0, ia: 0, novo: 0, pend: 0 });
  });
});
