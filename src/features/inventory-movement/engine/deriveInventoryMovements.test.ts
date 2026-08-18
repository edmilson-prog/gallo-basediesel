import { describe, expect, it } from "vitest";
import type { IFiscalNote, IFiscalNoteItem, IPart } from "@/shared/types";
import { deriveInventoryMovements } from "./deriveInventoryMovements";

const part = (id: string, over: Partial<IPart> = {}) =>
  ({
    id,
    sku: id,
    name: `Peça ${id}`,
    stockAvailable: 10,
    averageCost: 50,
    unitOfMeasure: "UN",
    oemCodes: ["OEM-1"],
    ...over,
  }) as IPart;

function item(over: Partial<IFiscalNoteItem> = {}): IFiscalNoteItem {
  return {
    id: "i1",
    noteId: "n1",
    seq: 1,
    supplierCode: "FS19532",
    description: "FILTRO CX C/12",
    unit: "CX",
    quantity: 16,
    unitValue: 566.4,
    totalValue: 9062.4,
    linkMode: "auto",
    partId: "p-fs",
    conversionMode: "conv",
    conversionFactor: 12,
    conversionUnit: "UN",
    confirmed: true,
    ...over,
  };
}

function postedNote(over: Partial<IFiscalNote> = {}): IFiscalNote {
  return {
    id: "n1",
    storeId: "s1",
    accessKey: "3".repeat(44),
    number: "10233",
    series: "1",
    supplierId: "sup-1",
    issuedAt: "2026-08-05T00:00:00.000Z",
    enteredAt: "2026-08-06T00:00:00.000Z",
    status: "lancada",
    origin: "upload",
    freight: 0,
    ipi: 0,
    discount: 0,
    productsTotal: 9062.4,
    total: 9062.4,
    items: [item()],
    duplicates: [],
    postedAt: "2026-08-07T12:00:00.000Z",
    postedBy: "seller-1",
    division: "parts",
    createdAt: "2026-08-06T00:00:00.000Z",
    updatedAt: "2026-08-07T12:00:00.000Z",
    ...over,
  };
}

describe("deriveInventoryMovements — entrada_compra (PRD-216 RF-102)", () => {
  it("emite uma entrada por item da nota lançada, com quantidade convertida", () => {
    const movs = deriveInventoryMovements({
      orders: [],
      parts: [part("p-fs")],
      fiscalNotes: [postedNote()],
    });
    expect(movs).toHaveLength(1);
    expect(movs[0]?.type).toBe("entrada_compra");
    expect(movs[0]?.partId).toBe("p-fs");
    expect(movs[0]?.quantity).toBe(192);
  });

  it("entrada é sempre positiva e carrega o número da nota", () => {
    const mov = deriveInventoryMovements({
      orders: [],
      parts: [part("p-fs")],
      fiscalNotes: [postedNote()],
    })[0];
    expect(mov!.quantity).toBeGreaterThan(0);
    expect(mov!.invoiceNumber).toBe("10233");
    expect(mov!.performedBy).toBe("seller-1");
    expect(mov!.performedAt).toBe("2026-08-07T12:00:00.000Z");
    expect(mov!.storeId).toBe("s1");
  });

  it("ignora nota em conferência — só a lançada move estoque", () => {
    expect(
      deriveInventoryMovements({
        orders: [],
        parts: [part("p-fs")],
        fiscalNotes: [postedNote({ status: "conferencia", postedAt: undefined })],
      }),
    ).toHaveLength(0);
  });

  it("ignora nota em rascunho — parada não move estoque", () => {
    expect(
      deriveInventoryMovements({
        orders: [],
        parts: [part("p-fs")],
        fiscalNotes: [postedNote({ status: "rascunho", postedAt: undefined })],
      }),
    ).toHaveLength(0);
  });

  it("credita o SKU de destino no fracionamento, não o faturado", () => {
    const mov = deriveInventoryMovements({
      orders: [],
      parts: [part("p-fs"), part("p-oleo")],
      fiscalNotes: [
        postedNote({
          items: [
            item({
              conversionMode: "frac",
              conversionFactor: 20,
              conversionUnit: "L",
              conversionTargetPartId: "p-oleo",
              quantity: 8,
              totalValue: 2064,
            }),
          ],
          productsTotal: 2064,
        }),
      ],
    })[0];
    expect(mov!.partId).toBe("p-oleo");
    expect(mov!.quantity).toBe(160);
  });

  it("usa o nome da peça do catálogo, com o da nota como reserva", () => {
    const withPart = deriveInventoryMovements({
      orders: [],
      parts: [part("p-fs", { name: "Filtro separador FS19532" })],
      fiscalNotes: [postedNote()],
    })[0];
    expect(withPart!.partName).toBe("Filtro separador FS19532");

    const withoutPart = deriveInventoryMovements({
      orders: [],
      parts: [],
      fiscalNotes: [postedNote()],
    })[0];
    expect(withoutPart!.partName).toBe("FILTRO CX C/12");
  });

  it("pula item cujo fator ficou indefinido em vez de emitir quantidade nula", () => {
    expect(
      deriveInventoryMovements({
        orders: [],
        parts: [part("p-fs")],
        fiscalNotes: [postedNote({ items: [item({ conversionFactor: null })] })],
      }),
    ).toHaveLength(0);
  });

  it("funciona sem o campo fiscalNotes — o contrato antigo segue válido", () => {
    expect(deriveInventoryMovements({ orders: [], parts: [] })).toEqual([]);
  });
});
