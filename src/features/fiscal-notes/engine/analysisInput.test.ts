import { describe, expect, it } from "vitest";
import type { IFiscalNote, IFiscalNoteItem, IPart, ISupplier } from "@/shared/types";
import { buildAnalysisInput, buildPurchaseHistory } from "./analysisInput";

const part = (id: string, over: Partial<IPart> = {}) =>
  ({
    id,
    sku: id,
    name: `Peça ${id}`,
    stockAvailable: 10,
    averageCost: 50,
    unitOfMeasure: "UN",
    fiscal: { ncm: "84099190" },
    ...over,
  }) as IPart;

function item(over: Partial<IFiscalNoteItem> = {}): IFiscalNoteItem {
  return {
    id: "i1",
    noteId: "n1",
    seq: 1,
    supplierCode: "BI-01",
    description: "BICO INJETOR",
    ncm: "84099190",
    unit: "UN",
    quantity: 4,
    unitValue: 346,
    totalValue: 1384,
    linkMode: "auto",
    partId: "p-bico",
    conversionMode: "direto",
    conversionFactor: null,
    confirmed: true,
    ...over,
  };
}

function note(over: Partial<IFiscalNote> = {}): IFiscalNote {
  return {
    id: "n1",
    storeId: "s1",
    accessKey: "1".repeat(44),
    number: "100",
    series: "1",
    supplierId: "sup-1",
    issuedAt: "2026-07-14T00:00:00.000Z",
    enteredAt: "2026-07-14T00:00:00.000Z",
    status: "lancada",
    origin: "upload",
    freight: 0,
    ipi: 0,
    discount: 0,
    productsTotal: 1384,
    total: 1384,
    items: [item()],
    duplicates: [],
    postedAt: "2026-07-14T10:00:00.000Z",
    division: "parts",
    createdAt: "2026-07-14T00:00:00.000Z",
    updatedAt: "2026-07-14T00:00:00.000Z",
    ...over,
  };
}

const supplier = (over: Partial<ISupplier> = {}) =>
  ({
    id: "sup-1",
    storeId: "s1",
    cnpj: "04887213000190",
    corporateName: "DIESELTEC LTDA",
    tradeName: "Dieseltec",
    active: true,
    createdFromXml: false,
    createdAt: "",
    updatedAt: "",
    ...over,
  }) as ISupplier;

const partsById = new Map([["p-bico", part("p-bico")]]);

describe("buildPurchaseHistory", () => {
  it("monta a série da mais antiga para a mais recente", () => {
    const history = buildPurchaseHistory(
      [
        note({ id: "b", accessKey: "2".repeat(44), postedAt: "2026-07-14T10:00:00.000Z" }),
        note({ id: "a", accessKey: "1".repeat(44), postedAt: "2026-02-10T10:00:00.000Z" }),
      ],
      partsById,
      new Map([["sup-1", supplier()]]),
    );
    expect(history["p-bico"]?.map((h) => h.purchasedAt)).toEqual([
      "2026-02-10T10:00:00.000Z",
      "2026-07-14T10:00:00.000Z",
    ]);
  });

  it("usa o custo por unidade de ESTOQUE, não o unitário da nota", () => {
    const history = buildPurchaseHistory(
      [
        note({
          items: [
            item({
              unit: "CX",
              quantity: 2,
              unitValue: 698.4,
              totalValue: 1396.8,
              conversionMode: "conv",
              conversionFactor: 12,
              conversionUnit: "UN",
            }),
          ],
          productsTotal: 1396.8,
        }),
      ],
      partsById,
      new Map([["sup-1", supplier()]]),
    );
    // 1396.80 / 24 = 58.20 — nada a ver com o vUnCom de 698.40
    expect(history["p-bico"]?.[0]?.unitCost).toBeCloseTo(58.2, 6);
  });

  it("nomeia o fornecedor da compra, com o CNPJ como reserva", () => {
    const history = buildPurchaseHistory([note()], partsById, new Map([["sup-1", supplier()]]));
    expect(history["p-bico"]?.[0]?.supplierName).toBe("Dieseltec");

    const orphan = buildPurchaseHistory([note()], partsById, new Map());
    expect(orphan["p-bico"]?.[0]?.supplierName).toBe("sup-1");
  });

  it("rotula o ponto com o mês abreviado", () => {
    const history = buildPurchaseHistory([note()], partsById, new Map([["sup-1", supplier()]]));
    expect(history["p-bico"]?.[0]?.label).toMatch(/jul/i);
  });

  it("ignora nota que não foi lançada — histórico é o que virou custo", () => {
    const history = buildPurchaseHistory(
      [note({ status: "conferencia", postedAt: undefined })],
      partsById,
      new Map(),
    );
    expect(history).toEqual({});
  });
});

describe("buildAnalysisInput", () => {
  const current = note({ id: "cur", accessKey: "9".repeat(44), status: "conferencia" });

  it("traz o NCM do catálogo para o card fiscal comparar", () => {
    const input = buildAnalysisInput({
      note: current,
      postedNotes: [],
      partsById,
      suppliersById: new Map([["sup-1", supplier()]]),
      allNotes: [current],
    });
    expect(input.items[0]?.catalogNcm).toBe("84099190");
    expect(input.items[0]?.ncm).toBe("84099190");
  });

  it("não inclui a própria chave em knownAccessKeys — senão toda nota seria duplicada", () => {
    const input = buildAnalysisInput({
      note: current,
      postedNotes: [],
      partsById,
      suppliersById: new Map([["sup-1", supplier()]]),
      allNotes: [current, note({ id: "outra", accessKey: "8".repeat(44) })],
    });
    expect(input.knownAccessKeys).toEqual(["8".repeat(44)]);
  });

  it("marca fornecedor criado do XML para o card de cadastro incompleto", () => {
    const input = buildAnalysisInput({
      note: current,
      postedNotes: [],
      partsById,
      suppliersById: new Map([["sup-1", supplier({ createdFromXml: true })]]),
      allNotes: [current],
    });
    expect(input.supplierIsNew).toBe(true);
    expect(input.supplierName).toBe("Dieseltec");
  });

  it("passa o custo por unidade de estoque como unitCost do item", () => {
    const input = buildAnalysisInput({
      note: current,
      postedNotes: [],
      partsById,
      suppliersById: new Map(),
      allNotes: [current],
    });
    expect(input.items[0]?.unitCost).toBeCloseTo(346, 6);
    expect(input.items[0]?.stockUnit).toBe("UN");
  });
});
