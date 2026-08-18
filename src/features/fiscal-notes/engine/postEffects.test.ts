import { describe, expect, it } from "vitest";
import type { IFiscalNote, IFiscalNoteItem, IPart } from "@/shared/types";
import {
  autoConfirmable,
  computeItemEffect,
  computePostEffects,
  validateForPosting,
} from "./postEffects";

function item(over: Partial<IFiscalNoteItem> = {}): IFiscalNoteItem {
  return {
    id: "i1",
    noteId: "n1",
    seq: 1,
    supplierCode: "FS19532",
    description: "FILTRO SEPARADOR CX C/12",
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

function note(over: Partial<IFiscalNote> = {}): IFiscalNote {
  return {
    id: "n1",
    storeId: "s1",
    accessKey: "3".repeat(44),
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
    items: [item()],
    duplicates: [],
    division: "parts",
    createdAt: "2026-08-06T00:00:00.000Z",
    updatedAt: "2026-08-06T00:00:00.000Z",
    ...over,
  };
}

const part = (over: Partial<IPart> = {}) =>
  ({
    id: "p-fs",
    sku: "FLT-FS19532",
    name: "Filtro separador FS19532",
    stockAvailable: 31,
    averageCost: 46.1,
    unitOfMeasure: "UN",
    ...over,
  }) as IPart;

describe("computeItemEffect", () => {
  it("converte a caixa em unidades e distribui o custo (RC-02)", () => {
    const effect = computeItemEffect(item(), note(), part());
    expect(effect.targetPartId).toBe("p-fs");
    expect(effect.stockQuantity).toBe(192);
    expect(effect.stockUnit).toBe("UN");
    expect(effect.unitCost).toBeCloseTo(47.2, 6);
  });

  it("credita o SKU de destino quando fraciona (RC-03)", () => {
    const effect = computeItemEffect(
      item({
        conversionMode: "frac",
        conversionFactor: 20,
        conversionUnit: "L",
        conversionTargetPartId: "p-oleo",
        quantity: 8,
        totalValue: 2064,
      }),
      note({ productsTotal: 2064, total: 2064 }),
      part(),
    );
    expect(effect.targetPartId).toBe("p-oleo");
    expect(effect.stockQuantity).toBe(160);
    expect(effect.unitCost).toBeCloseTo(12.9, 6);
  });

  it("rateia frete e IPI por valor entre os itens (RC-01)", () => {
    const a = item({ id: "a", totalValue: 1396.8, quantity: 2, conversionFactor: 12 });
    const b = item({
      id: "b",
      partId: "p-bico",
      totalValue: 1556,
      quantity: 4,
      conversionMode: "direto",
    });
    const n = note({ items: [a, b], freight: 182.2, ipi: 214.9, productsTotal: 2952.8 });
    const effect = computeItemEffect(a, n, part());
    expect(effect.allocatedCharges).toBeCloseTo(397.1 * (1396.8 / 2952.8), 6);
    expect(effect.unitCost).toBeCloseTo((1396.8 + effect.allocatedCharges) / 24, 6);
  });

  it("devolve null quando o fator está indefinido — é o que trava o lançamento", () => {
    const effect = computeItemEffect(item({ conversionFactor: null }), note(), part());
    expect(effect.stockQuantity).toBeNull();
    expect(effect.unitCost).toBeNull();
    expect(effect.newAverageCost).toBeNull();
  });

  it("pondera o custo médio contra o saldo existente (RC-04)", () => {
    const effect = computeItemEffect(item(), note(), part());
    expect(effect.newAverageCost).toBeCloseTo((31 * 46.1 + 192 * 47.2) / 223, 6);
    expect(effect.averageCostDelta).toBeCloseTo(effect.newAverageCost! - 46.1, 6);
  });

  it("cai no custo da entrada quando a peça não tem saldo nem média", () => {
    const effect = computeItemEffect(item(), note(), undefined);
    expect(effect.newAverageCost).toBeCloseTo(47.2, 6);
  });
});

describe("validateForPosting", () => {
  it("aprova a nota com tudo conferido e fator definido", () => {
    expect(validateForPosting(note())).toEqual({ ok: true, blockers: [] });
  });

  it("barra item não conferido", () => {
    const v = validateForPosting(note({ items: [item({ confirmed: false })] }));
    expect(v.ok).toBe(false);
    expect(v.blockers[0]?.reason).toBe("unconfirmed");
  });

  it("barra fator de conversão indefinido", () => {
    const v = validateForPosting(note({ items: [item({ conversionFactor: null })] }));
    expect(v.ok).toBe(false);
    expect(v.blockers[0]?.reason).toBe("missing_factor");
  });

  it("barra fracionamento sem SKU de destino", () => {
    const v = validateForPosting(
      note({ items: [item({ conversionMode: "frac", conversionTargetPartId: undefined })] }),
    );
    expect(v.ok).toBe(false);
    expect(v.blockers.some((b) => b.reason === "missing_fraction_target")).toBe(true);
  });

  it("barra item conferido sem produto nem rascunho de produto novo", () => {
    const v = validateForPosting(note({ items: [item({ partId: undefined, linkMode: "pend" })] }));
    expect(v.ok).toBe(false);
    expect(v.blockers[0]?.reason).toBe("missing_link");
  });

  it("aceita item sem partId quando há rascunho de produto novo", () => {
    const v = validateForPosting(
      note({
        items: [
          item({
            partId: undefined,
            linkMode: "novo",
            newPartDraft: { name: "Kit dreno Racor", unitOfMeasure: "UN" },
          }),
        ],
      }),
    );
    expect(v.ok).toBe(true);
  });

  it("barra nota que não está em conferência", () => {
    const v = validateForPosting(note({ status: "lancada" }));
    expect(v.ok).toBe(false);
    expect(v.blockers[0]?.reason).toBe("not_in_review");
  });
});

describe("autoConfirmable", () => {
  it("devolve só os itens vinculados pelo código e com fator resolvido", () => {
    const ids = autoConfirmable(
      note({
        items: [
          item({ id: "a", confirmed: false }),
          item({ id: "b", confirmed: false, linkMode: "ia" }),
          item({ id: "c", confirmed: false, conversionFactor: null }),
          item({ id: "d", confirmed: true }),
        ],
      }),
    );
    expect(ids).toEqual(["a"]);
  });
});

describe("computePostEffects", () => {
  it("agrega por peça e devolve o que o lançamento produz", () => {
    const parts = new Map([["p-fs", part()]]);
    const effects = computePostEffects(note(), parts);
    expect(effects.parts).toHaveLength(1);
    expect(effects.parts[0]?.partId).toBe("p-fs");
    expect(effects.parts[0]?.quantityAdded).toBe(192);
    expect(effects.parts[0]?.newStock).toBe(223);
    expect(effects.learnedCodes).toEqual([
      { supplierId: "sup-1", supplierCode: "FS19532", partId: "p-fs" },
    ]);
    expect(effects.learnedRules).toEqual([
      {
        supplierId: "sup-1",
        partId: "p-fs",
        mode: "conv",
        fromUnit: "CX",
        factor: 12,
        toUnit: "UN",
        targetPartId: undefined,
      },
    ]);
  });

  it("soma dois itens que caem na mesma peça", () => {
    const parts = new Map([["p-fs", part()]]);
    const n = note({
      items: [
        item({ id: "a" }),
        item({ id: "b", supplierCode: "FS19532-B", quantity: 1, totalValue: 566.4 }),
      ],
      productsTotal: 9628.8,
    });
    const effects = computePostEffects(n, parts);
    expect(effects.parts).toHaveLength(1);
    expect(effects.parts[0]?.quantityAdded).toBe(192 + 12);
  });

  it("não aprende regra para item em modo direto — não há fator a guardar", () => {
    const effects = computePostEffects(
      note({ items: [item({ conversionMode: "direto", conversionFactor: null })] }),
      new Map([["p-fs", part()]]),
    );
    expect(effects.learnedRules).toEqual([]);
  });
});
