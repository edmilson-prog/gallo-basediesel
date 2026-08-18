import { beforeEach, describe, expect, it } from "vitest";
import { mockFiscalNotesProvider, __resetFiscalNotesMock } from "./fiscalNotes";
import { mockSuppliersProvider, __resetSuppliersMock } from "./suppliers";

const KEY = "35260804887213000190550010000301291000301298";

function seedSupplier() {
  return mockSuppliersProvider.create({
    storeId: "store-1",
    cnpj: "04887213000190",
    corporateName: "DIESELTEC DISTRIBUIDORA LTDA",
    active: true,
    createdFromXml: true,
  });
}

/** Fornecedor e nota são criados separadamente de propósito: assim o teste de
 *  chave duplicada exercita a guarda da NOTA, e não a guarda de CNPJ do
 *  fornecedor, que dispararia antes e mascararia a primeira. */
async function seedNote(supplierId?: string) {
  const supplier = supplierId ?? (await seedSupplier()).id;
  return mockFiscalNotesProvider.create({
    storeId: "store-1",
    accessKey: KEY,
    number: "30129",
    series: "1",
    supplierId: supplier,
    issuedAt: "2026-08-14T09:12:00-03:00",
    enteredAt: "2026-08-17T10:00:00-03:00",
    status: "conferencia",
    origin: "upload",
    freight: 182.2,
    ipi: 214.9,
    discount: 0,
    productsTotal: 2952.8,
    total: 3349.9,
    division: "parts",
    items: [
      {
        seq: 1,
        supplierCode: "RC-R60T",
        description: "FILTRO SEPARADOR RACOR R60T CX C/12",
        unit: "CX",
        quantity: 2,
        unitValue: 698.4,
        totalValue: 1396.8,
        linkMode: "pend",
        conversionMode: "direto",
        conversionFactor: null,
        confirmed: false,
      },
    ],
    duplicates: [{ number: "001", dueDate: "2026-09-16", amount: 1116.64 }],
  });
}

describe("mockFiscalNotesProvider", () => {
  beforeEach(() => {
    __resetFiscalNotesMock();
    __resetSuppliersMock();
  });

  it("creates a note with ids assigned to items and duplicates", async () => {
    const note = await seedNote();
    expect(note.id).toBeTruthy();
    expect(note.items[0]?.id).toBeTruthy();
    expect(note.items[0]?.noteId).toBe(note.id);
    expect(note.duplicates[0]?.id).toBeTruthy();
  });

  it("finds a note by access key", async () => {
    const note = await seedNote();
    expect((await mockFiscalNotesProvider.findByAccessKey(KEY))?.id).toBe(note.id);
  });

  it("returns null for an unknown access key", async () => {
    await seedNote();
    expect(await mockFiscalNotesProvider.findByAccessKey("0".repeat(44))).toBeNull();
  });

  it("refuses a duplicated access key", async () => {
    const supplier = await seedSupplier();
    await seedNote(supplier.id);
    // Mesmo fornecedor, mesma chave: a única guarda que pode disparar é a da nota.
    await expect(seedNote(supplier.id)).rejects.toThrow(/chave de acesso/i);
  });

  it("refuses a second supplier with the same CNPJ in the same store", async () => {
    await seedSupplier();
    await expect(seedSupplier()).rejects.toThrow(/CNPJ/i);
  });

  it("patches an item and leaves the others alone", async () => {
    const note = await seedNote();
    const updated = await mockFiscalNotesProvider.updateItem(note.items[0]!.id, {
      linkMode: "auto",
      partId: "p-r60t",
      conversionMode: "conv",
      conversionFactor: 12,
      conversionUnit: "UN",
      confirmed: true,
    });
    expect(updated.confirmed).toBe(true);
    expect(updated.conversionFactor).toBe(12);
    // a descrição veio do XML e não pode ter sido tocada
    expect(updated.description).toBe("FILTRO SEPARADOR RACOR R60T CX C/12");
  });

  it("filters the list by status", async () => {
    await seedNote();
    expect((await mockFiscalNotesProvider.list({ status: "conferencia" })).total).toBe(1);
    expect((await mockFiscalNotesProvider.list({ status: "lancada" })).total).toBe(0);
  });

  it("removes a note entirely, freeing the access key", async () => {
    const note = await seedNote();
    await mockFiscalNotesProvider.remove(note.id);
    await expect(mockFiscalNotesProvider.get(note.id)).rejects.toThrow(/não encontrada/i);
    expect(await mockFiscalNotesProvider.findByAccessKey(KEY)).toBeNull();
  });
});

describe("mockSuppliersProvider", () => {
  beforeEach(() => __resetSuppliersMock());

  it("finds a supplier by CNPJ within the store", async () => {
    const created = await mockSuppliersProvider.create({
      storeId: "store-1",
      cnpj: "04887213000190",
      corporateName: "DIESELTEC",
      active: true,
      createdFromXml: true,
    });
    expect((await mockSuppliersProvider.findByCnpj("04887213000190", "store-1"))?.id).toBe(
      created.id,
    );
  });

  it("returns null when the CNPJ belongs to another store", async () => {
    await mockSuppliersProvider.create({
      storeId: "store-1",
      cnpj: "04887213000190",
      corporateName: "DIESELTEC",
      active: true,
      createdFromXml: true,
    });
    expect(await mockSuppliersProvider.findByCnpj("04887213000190", "store-2")).toBeNull();
  });
});
