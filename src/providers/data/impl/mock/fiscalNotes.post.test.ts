import { beforeEach, describe, expect, it } from "vitest";
import type { IPart } from "@/shared/types";
import { __resetFiscalNotesMock, mockFiscalNotesProvider } from "./fiscalNotes";

const KEY = "35260804887213000190550010000301291000301298";

const parts: IPart[] = [
  {
    id: "p-fs",
    sku: "FLT-FS19532",
    name: "Filtro separador",
    stockAvailable: 31,
    averageCost: 46.1,
    unitOfMeasure: "UN",
  } as IPart,
];

async function seed(confirmed = true) {
  return mockFiscalNotesProvider.create({
    storeId: "s1",
    accessKey: KEY,
    number: "10233",
    series: "1",
    supplierId: "sup-1",
    issuedAt: "2026-08-05T00:00:00.000Z",
    enteredAt: "2026-08-06T00:00:00.000Z",
    status: "conferencia",
    origin: "upload",
    freight: 0,
    ipi: 0,
    discount: 0,
    productsTotal: 9062.4,
    total: 9062.4,
    division: "parts",
    items: [
      {
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
        confirmed,
      },
    ],
    duplicates: [],
  });
}

describe("mockFiscalNotesProvider.post", () => {
  beforeEach(() => __resetFiscalNotesMock());

  it("lança a nota e carimba quando foi lançada", async () => {
    const note = await seed();
    const posted = await mockFiscalNotesProvider.post(note.id, { parts });
    expect(posted.status).toBe("lancada");
    expect(posted.postedAt).toBeTruthy();
  });

  it("recusa item não conferido", async () => {
    const note = await seed(false);
    await expect(mockFiscalNotesProvider.post(note.id, { parts })).rejects.toThrow(/confer/i);
  });

  it("recusa lançar a mesma nota duas vezes", async () => {
    const note = await seed();
    await mockFiscalNotesProvider.post(note.id, { parts });
    await expect(mockFiscalNotesProvider.post(note.id, { parts })).rejects.toThrow(/lançada/i);
  });

  it("nota lançada rejeita edição de item — imutável", async () => {
    const note = await seed();
    await mockFiscalNotesProvider.post(note.id, { parts });
    await expect(
      mockFiscalNotesProvider.updateItem(note.items[0]!.id, { confirmed: false }),
    ).rejects.toThrow(/imutável/i);
  });

  it("nota lançada não pode ser apagada — corrigir é estornar", async () => {
    const note = await seed();
    await mockFiscalNotesProvider.post(note.id, { parts });
    await expect(mockFiscalNotesProvider.remove(note.id)).rejects.toThrow(/estorna/i);
  });

  it("apagar libera a chave: o mesmo XML entra de novo", async () => {
    const note = await seed();
    await mockFiscalNotesProvider.remove(note.id);
    expect(await mockFiscalNotesProvider.findByAccessKey(KEY)).toBeNull();
    // A prova real do que o dono pediu: reimportar o mesmo arquivo.
    const again = await seed();
    expect(again.accessKey).toBe(KEY);
    expect(again.id).not.toBe(note.id);
  });

  it("estacionar como rascunho tira da fila sem perder nada", async () => {
    const note = await seed(false);
    const draft = await mockFiscalNotesProvider.markDraft(note.id);
    expect(draft.status).toBe("rascunho");
    expect(draft.items).toHaveLength(1);
    expect((await mockFiscalNotesProvider.list({ status: "conferencia" })).total).toBe(0);
    expect((await mockFiscalNotesProvider.list({ status: "rascunho" })).total).toBe(1);
  });

  it("rascunho ainda aceita edição de item — é para isso que ele serve", async () => {
    const note = await seed(false);
    await mockFiscalNotesProvider.markDraft(note.id);
    const item = await mockFiscalNotesProvider.updateItem(note.items[0]!.id, {
      partId: "p-fs",
      confirmed: false,
    });
    expect(item.partId).toBe("p-fs");
    expect(item.confirmed).toBe(false);
  });

  it("retomar devolve o rascunho para a fila", async () => {
    const note = await seed(false);
    await mockFiscalNotesProvider.markDraft(note.id);
    expect((await mockFiscalNotesProvider.resumeFromDraft(note.id)).status).toBe("conferencia");
  });

  it("nota lançada não vira rascunho", async () => {
    const note = await seed();
    await mockFiscalNotesProvider.post(note.id, { parts });
    await expect(mockFiscalNotesProvider.markDraft(note.id)).rejects.toThrow(/imutável/i);
  });

  it("o estorno devolve a nota para conferência e limpa o carimbo", async () => {
    const note = await seed();
    await mockFiscalNotesProvider.post(note.id, { parts });
    const reversed = await mockFiscalNotesProvider.reverse(note.id, { parts });
    expect(reversed.status).toBe("conferencia");
    expect(reversed.postedAt).toBeUndefined();
    expect(reversed.postedBy).toBeUndefined();
  });

  it("recusa estornar nota que não foi lançada", async () => {
    const note = await seed();
    await expect(mockFiscalNotesProvider.reverse(note.id, { parts })).rejects.toThrow(/lançada/i);
  });

  it("depois do estorno a nota volta a aceitar edição", async () => {
    const note = await seed();
    await mockFiscalNotesProvider.post(note.id, { parts });
    await mockFiscalNotesProvider.reverse(note.id, { parts });
    const item = await mockFiscalNotesProvider.updateItem(note.items[0]!.id, { confirmed: false });
    expect(item.confirmed).toBe(false);
  });
});
