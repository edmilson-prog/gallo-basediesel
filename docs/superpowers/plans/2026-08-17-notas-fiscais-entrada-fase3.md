# Notas Fiscais de Entrada — Fase 3 (Conferência e lançamento) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lançar uma nota move o saldo, recalcula o custo médio, grava o que a conferência ensinou e faz `entrada_compra` aparecer em Gestão → Movimentação.

**Architecture:** O efeito do lançamento é calculado por uma função pura (`computePostEffects`) que serve de contrato único: o mock aplica o resultado dela na loja em memória, a RPC `post_fiscal_note` aplica o mesmo no Postgres numa transação. `entrada_compra` **não vira tabela** — `deriveInventoryMovements` ganha as notas lançadas como segunda fonte, ao lado dos pedidos.

**Tech Stack:** React 19 · TanStack Query · Postgres (plpgsql, `security definer`) · Tailwind v4 + shadcn/ui · Vitest

**Spec:** `docs/prds/PRD-216-notas-fiscais-entrada.md` (Fase 3: RF-100, RF-101, RF-102, RF-114 e CA-04 a CA-10)

## Global Constraints

- **Branch:** `claude/fiscal-notes-fase3`, criada de `claude/fiscal-notes-fase2`. PR com **base = `claude/fiscal-notes-fase2`**. Pilha de três: #510 → #511 → este. O GitHub só reaponta cada um se a base for **deletada** no merge.
- **`entrada_compra` não cria tabela.** O ledger continua derivado (RF-102). Quem propuser persistir está mudando o PRD, não implementando-o.
- **Nota lançada é imutável.** `updateItem` já recusa nota fora de `conferencia`; `cancel` já recusa nota lançada. A UI não oferece edição — oferece estorno.
- **O mock precisa recusar tanto quanto o Postgres.** Item não conferido, fator indefinido e nota já lançada barram o lançamento nos dois.
- **Migration NÃO é aplicada.** Vai para `supabase/migrations/` e aguarda OK explícito do dono.
- **`sellers(id)` é o alvo de autoria**, nunca `profiles(id)` — `profiles` não tem coluna `id`. A RPC usa `public.current_seller_id()`.
- **`noUncheckedIndexedAccess` está ligado.** Estreitar explicitamente; nada de `any` nem `@ts-ignore`.
- **Tokens semânticos apenas**, `docs/dev/ux-guidelines.md` obrigatório, texto de UI em pt-BR acentuado, código e commits em inglês.
- **Mexeu em `engine/{nfeKey,xml,nfeParser,costAllocation}.ts`?** Rodar `bun run sync:fiscal` antes de commitar.
- **Gate:** `bun run test` · `bun run build` · `bunx tsc --noEmit` sem erro em arquivo novo ou editado · `eslint` limpo nos arquivos da fase.

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `engine/postEffects.ts` | `computeItemEffect`, `computePostEffects`, `validateForPosting`, `autoConfirmable` |
| `engine/postEffects.test.ts` | testes das quatro |
| `contracts/fiscalNotes.ts` *(mod)* | `post`, `reverse`, `IPostEffects` |
| `impl/mock/fiscalNotes.ts` *(mod)* | aplica os efeitos na loja em memória |
| `impl/supabase/fiscalNotes.ts` *(mod)* | chama as duas RPCs |
| `supabase/migrations/20260817140000_fiscal_note_posting.sql` | `post_fiscal_note` + `reverse_fiscal_note` |
| `inventory-movement/engine/deriveInventoryMovements.ts` *(mod)* | emite `entrada_compra` |
| `inventory-movement/hooks/useInventoryMovements.ts` *(mod)* | busca notas lançadas |
| `fiscal-notes/hooks/useNoteReview.ts` | conferência, lote, lançar, estornar, auditoria |
| `components/review/NoteItemsTable.tsx` | itens da nota com o efeito calculado |
| `components/review/NoteItemDrawer.tsx` | vínculo · conversão · fracionamento |
| `components/review/NoteReviewSidebar.tsx` | fornecedor, totais, duplicatas, botão de lançar |
| `pages/FiscalNoteReviewPage.tsx` | a tela |
| `src/routes/app.suprimentos.entrada.$id.tsx` | rota com guard |

---

### Task 1: Motor dos efeitos do lançamento

**Files:**
- Create: `src/features/fiscal-notes/engine/postEffects.ts`
- Test: `src/features/fiscal-notes/engine/postEffects.test.ts`
- Modify: `src/features/fiscal-notes/engine/index.ts`

**Interfaces:**
- Consumes: `allocateCharges` (RC-01), `convertToStock` (RC-02/03), `weightedAverageCost` (RC-04) da Fase 1
- Produces: `computeItemEffect(item, note, part?): IItemEffect` · `computePostEffects(note, partsById): IPostEffects` · `validateForPosting(note): IPostValidation` · `autoConfirmable(note): ID[]`

> Este módulo é o contrato único do lançamento: o mock e a RPC aplicam o que ele calcula. Se um dia divergirem, é aqui que o teste falha primeiro.

- [ ] **Step 1: Escrever o teste (vai falhar)**

`src/features/fiscal-notes/engine/postEffects.test.ts`:

```ts
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
    const b = item({ id: "b", partId: "p-bico", totalValue: 1556, quantity: 4, conversionMode: "direto" });
    const n = note({ items: [a, b], freight: 182.2, ipi: 214.9, productsTotal: 2952.8 });
    const effect = computeItemEffect(a, n, part());
    // 397.10 de encargos × (1396.80 / 2952.80) = 187.83…
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
    // 31 × 46.10 + 192 × 47.20, sobre 223
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
    expect(v.blockers[0]?.reason).toBe("missing_fraction_target");
  });

  it("barra item conferido sem produto nem rascunho de produto novo", () => {
    const v = validateForPosting(
      note({ items: [item({ partId: undefined, linkMode: "pend" })] }),
    );
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
      items: [item({ id: "a" }), item({ id: "b", supplierCode: "FS19532-B", quantity: 1, totalValue: 566.4 })],
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
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
bun run test -- src/features/fiscal-notes/engine/postEffects.test.ts
```

Esperado: FAIL — `Failed to resolve import "./postEffects"`.

- [ ] **Step 3: Implementar**

`src/features/fiscal-notes/engine/postEffects.ts`:

```ts
import type { ID, IFiscalNote, IFiscalNoteItem, IPart } from "@/shared/types";
import { allocateCharges } from "./costAllocation";
import { convertToStock } from "./unitConversion";
import { weightedAverageCost } from "./averageCost";

/**
 * Efeitos do lançamento da nota (PRD-216, RF-100).
 *
 * Contrato ÚNICO do lançamento: o provider mock aplica o que este módulo
 * calcula, e a RPC `post_fiscal_note` aplica o mesmo no Postgres. Divergir
 * daqui é divergir entre as duas fontes de dados.
 *
 * Puro e sem I/O — recebe a nota e o catálogo relevante já resolvidos.
 */

export interface IItemEffect {
  itemId: ID;
  /** Peça creditada. No fracionamento é o SKU de destino, não o faturado. */
  targetPartId?: ID;
  allocatedCharges: number;
  stockQuantity: number | null;
  stockUnit: string;
  unitCost: number | null;
  newAverageCost: number | null;
  /** Diferença sobre o custo médio atual. `null` sem base de comparação. */
  averageCostDelta: number | null;
}

export interface IPartEffect {
  partId: ID;
  quantityAdded: number;
  previousStock: number;
  newStock: number;
  previousAverageCost: number;
  newAverageCost: number;
}

export interface ILearnedCode {
  supplierId: ID;
  supplierCode: string;
  partId: ID;
}

export interface ILearnedRule {
  supplierId: ID;
  partId: ID;
  mode: "conv" | "frac";
  fromUnit: string;
  factor: number;
  toUnit: string;
  targetPartId?: ID;
}

export interface IPostEffects {
  parts: IPartEffect[];
  learnedCodes: ILearnedCode[];
  learnedRules: ILearnedRule[];
}

export type PostBlockerReason =
  | "not_in_review"
  | "unconfirmed"
  | "missing_factor"
  | "missing_fraction_target"
  | "missing_link";

export interface IPostBlocker {
  itemId?: ID;
  reason: PostBlockerReason;
}

export interface IPostValidation {
  ok: boolean;
  blockers: IPostBlocker[];
}

/** Peça creditada: no fracionamento o saldo vai para o SKU de destino. */
function targetPartOf(item: IFiscalNoteItem): ID | undefined {
  return item.conversionMode === "frac" ? item.conversionTargetPartId : item.partId;
}

export function computeItemEffect(
  item: IFiscalNoteItem,
  note: IFiscalNote,
  part: IPart | undefined,
): IItemEffect {
  const allocation = allocateCharges({
    items: note.items.map((i) => ({ id: i.id, totalValue: i.totalValue })),
    freight: note.freight,
    ipi: note.ipi,
    discount: note.discount,
  });
  const allocatedCharges = allocation.get(item.id) ?? 0;

  const conversion = convertToStock({
    quantity: item.quantity,
    mode: item.conversionMode,
    factor: item.conversionFactor,
    noteUnit: item.unit,
    conversionUnit: item.conversionUnit,
    partUnit: part?.unitOfMeasure,
    itemTotalValue: item.totalValue,
    allocatedCharges,
  });

  const currentAverage = part?.averageCost ?? 0;
  const newAverageCost =
    conversion.unitCost === null || conversion.stockQuantity === null
      ? null
      : weightedAverageCost({
          currentStock: part?.stockAvailable ?? 0,
          currentAverage,
          incomingQuantity: conversion.stockQuantity,
          incomingUnitCost: conversion.unitCost,
        });

  return {
    itemId: item.id,
    targetPartId: targetPartOf(item),
    allocatedCharges,
    stockQuantity: conversion.stockQuantity,
    stockUnit: conversion.stockUnit,
    unitCost: conversion.unitCost,
    newAverageCost,
    averageCostDelta:
      newAverageCost === null || currentAverage <= 0 ? null : newAverageCost - currentAverage,
  };
}

export function validateForPosting(note: IFiscalNote): IPostValidation {
  const blockers: IPostBlocker[] = [];

  if (note.status !== "conferencia") {
    blockers.push({ reason: "not_in_review" });
  }

  for (const item of note.items) {
    if (!item.confirmed) {
      blockers.push({ itemId: item.id, reason: "unconfirmed" });
      continue;
    }
    if (!item.partId && !item.newPartDraft) {
      blockers.push({ itemId: item.id, reason: "missing_link" });
    }
    if (item.conversionMode !== "direto" && (item.conversionFactor ?? 0) <= 0) {
      blockers.push({ itemId: item.id, reason: "missing_factor" });
    }
    if (item.conversionMode === "frac" && !item.conversionTargetPartId) {
      blockers.push({ itemId: item.id, reason: "missing_fraction_target" });
    }
  }

  return { ok: blockers.length === 0, blockers };
}

/**
 * Itens que `Confirmar vinculados` resolve em lote: só os que vieram
 * vinculados pelo CÓDIGO do fornecedor — um humano já confirmou esse par numa
 * nota anterior. Sugestão da IA nunca entra no lote; ela precisa de aceite.
 */
export function autoConfirmable(note: IFiscalNote): ID[] {
  return note.items
    .filter(
      (item) =>
        !item.confirmed &&
        item.linkMode === "auto" &&
        Boolean(item.partId) &&
        (item.conversionMode === "direto" || (item.conversionFactor ?? 0) > 0),
    )
    .map((item) => item.id);
}

export function computePostEffects(
  note: IFiscalNote,
  partsById: Map<ID, IPart>,
): IPostEffects {
  const byPart = new Map<ID, IPartEffect>();
  const learnedCodes: ILearnedCode[] = [];
  const learnedRules: ILearnedRule[] = [];

  for (const item of note.items) {
    const targetId = targetPartOf(item);
    if (!targetId) continue;

    const effect = computeItemEffect(item, note, partsById.get(targetId));
    if (effect.stockQuantity === null || effect.unitCost === null) continue;

    const target = partsById.get(targetId);
    const existing = byPart.get(targetId);
    const previousStock = existing?.newStock ?? target?.stockAvailable ?? 0;
    const previousAverage = existing?.newAverageCost ?? target?.averageCost ?? 0;

    byPart.set(targetId, {
      partId: targetId,
      quantityAdded: (existing?.quantityAdded ?? 0) + effect.stockQuantity,
      previousStock: existing?.previousStock ?? target?.stockAvailable ?? 0,
      newStock: previousStock + effect.stockQuantity,
      previousAverageCost: existing?.previousAverageCost ?? target?.averageCost ?? 0,
      newAverageCost: weightedAverageCost({
        currentStock: previousStock,
        currentAverage: previousAverage,
        incomingQuantity: effect.stockQuantity,
        incomingUnitCost: effect.unitCost,
      }),
    });

    if (item.partId) {
      learnedCodes.push({
        supplierId: note.supplierId,
        supplierCode: item.supplierCode,
        partId: item.partId,
      });
    }

    // Modo direto não tem fator a guardar — a unidade da nota já é a de estoque.
    if (item.conversionMode !== "direto" && item.partId && (item.conversionFactor ?? 0) > 0) {
      learnedRules.push({
        supplierId: note.supplierId,
        partId: item.partId,
        mode: item.conversionMode,
        fromUnit: item.unit,
        factor: item.conversionFactor as number,
        toUnit: item.conversionUnit ?? effect.stockUnit,
        targetPartId: item.conversionTargetPartId,
      });
    }
  }

  return { parts: [...byPart.values()], learnedCodes, learnedRules };
}
```

- [ ] **Step 4: Exportar e rodar**

```bash
echo 'export * from "./postEffects";' >> src/features/fiscal-notes/engine/index.ts
bun run test -- src/features/fiscal-notes/engine/postEffects.test.ts
```

Esperado: PASS, 15 testes.

- [ ] **Step 5: Commit**

```bash
git add src/features/fiscal-notes/engine/postEffects.ts src/features/fiscal-notes/engine/postEffects.test.ts src/features/fiscal-notes/engine/index.ts
git commit -m "feat(fiscal-notes): compute the effects a posted note produces"
```

---

### Task 2: Derivação de `entrada_compra`

**Files:**
- Modify: `src/features/inventory-movement/engine/deriveInventoryMovements.ts`
- Create: `src/features/inventory-movement/engine/deriveInventoryMovements.test.ts`
- Modify: `src/features/inventory-movement/hooks/useInventoryMovements.ts`

**Interfaces:**
- Consumes: `IFiscalNote` · `computeItemEffect` (Task 1)
- Produces: `IDeriveMovementsContext` ganha `fiscalNotes?: IFiscalNote[]`

> RF-102: o ledger continua **derivado**, e passa a ter duas fontes — pedidos e notas lançadas. Zero migration para isso, e os campos `entrada_compra`/`invoiceNumber`, reservados desde o PRD-052, finalmente saem do limbo.

- [ ] **Step 1: Escrever o teste (vai falhar)**

`src/features/inventory-movement/engine/deriveInventoryMovements.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { IFiscalNote, IFiscalNoteItem, IPart } from "@/shared/types";
import { deriveInventoryMovements } from "./deriveInventoryMovements";

const part = (id: string, over: Partial<IPart> = {}) =>
  ({ id, sku: id, name: `Peça ${id}`, stockAvailable: 10, averageCost: 50, unitOfMeasure: "UN", oemCodes: ["OEM-1"], ...over }) as IPart;

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

  it("ignora nota cancelada", () => {
    expect(
      deriveInventoryMovements({
        orders: [],
        parts: [part("p-fs")],
        fiscalNotes: [postedNote({ status: "cancelada" })],
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
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
bun run test -- src/features/inventory-movement/engine/deriveInventoryMovements.test.ts
```

Esperado: FAIL — `fiscalNotes` não existe em `IDeriveMovementsContext`.

- [ ] **Step 3: Estender a derivação**

Em `src/features/inventory-movement/engine/deriveInventoryMovements.ts`, trocar o import e o contexto:

```ts
import type { IFiscalNote, IInventoryMovement, IOrder, IPart } from "@/shared/types";
import { computeItemEffect } from "@/features/fiscal-notes/engine/postEffects";

export interface IDeriveMovementsContext {
  orders: IOrder[];
  parts: IPart[];
  /**
   * Notas fiscais de entrada LANÇADAS (PRD-216 RF-102). Opcional para não
   * quebrar quem já chamava com pedidos apenas.
   */
  fiscalNotes?: IFiscalNote[];
}
```

E, imediatamente antes do `out.sort(...)` final, acrescentar o segundo produtor:

```ts
  // Segunda fonte do ledger: nota fiscal lançada (PRD-216 RF-102). O tipo
  // `entrada_compra` e o campo `invoiceNumber` estavam reservados desde o
  // PRD-052 — é aqui que saem do limbo, sem tabela nova.
  for (const note of ctx.fiscalNotes ?? []) {
    if (note.status !== "lancada") continue;

    for (const item of note.items) {
      const targetId =
        item.conversionMode === "frac" ? item.conversionTargetPartId : item.partId;
      if (!targetId) continue;

      const target = partsById.get(targetId);
      const effect = computeItemEffect(item, note, target);
      if (effect.stockQuantity === null || effect.stockQuantity === 0) continue;

      out.push({
        id: `mov-nf-${note.id}-${item.id}`,
        type: "entrada_compra",
        partId: targetId,
        partName: target?.name ?? item.description,
        partOemCode: pickPrimaryOemCode(target),
        // Entrada sempre positiva.
        quantity: effect.stockQuantity,
        invoiceNumber: note.number,
        performedBy: note.postedBy ?? "system",
        performedAt: note.postedAt ?? note.updatedAt,
        storeId: note.storeId,
      });
    }
  }
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
bun run test -- src/features/inventory-movement/
```

Esperado: PASS, 8 testes novos e nenhuma regressão.

- [ ] **Step 5: Alimentar o hook com as notas lançadas**

Em `src/features/inventory-movement/hooks/useInventoryMovements.ts`, acrescentar o provider e a query, e passar o resultado à derivação:

```ts
import { useFiscalNotesProvider } from "@/providers/data";
```

```ts
  const fiscalNotesProvider = useFiscalNotesProvider();

  const fiscalNotesQuery = useQuery({
    queryKey: ["inventory-movement", "fiscal-notes", storeScope.join(",")] as const,
    queryFn: async () => {
      const results = await Promise.all(
        storeScope.map((sid) =>
          fiscalNotesProvider.list({ storeId: sid, status: "lancada", pageSize: PAGE_SIZE_PROVIDER }),
        ),
      );
      return results.flatMap((r) => r.data);
    },
    staleTime: STALE_MS,
    enabled: storeScope.length > 0,
  });
```

E no `useMemo` da derivação:

```ts
    return deriveInventoryMovements({
      orders: ordersQuery.data,
      parts: partsQuery.data?.data ?? [],
      fiscalNotes: fiscalNotesQuery.data ?? [],
    });
  }, [ordersQuery.data, partsQuery.data, fiscalNotesQuery.data]);
```

- [ ] **Step 6: Verificar tipos e commit**

```bash
bunx tsc --noEmit 2>&1 | grep -E "inventory-movement|fiscal-notes"
git add src/features/inventory-movement/
git commit -m "feat(fiscal-notes): derive entrada_compra movements from posted notes"
```

---

### Task 3: Contrato e provider mock de lançamento

**Files:**
- Modify: `src/providers/data/contracts/fiscalNotes.ts`
- Modify: `src/providers/data/impl/mock/fiscalNotes.ts`
- Create: `src/providers/data/impl/mock/fiscalNotes.post.test.ts`
- Modify: `src/providers/data/index.ts`

**Interfaces:**
- Consumes: `validateForPosting`, `computePostEffects` (Task 1)
- Produces: `IFiscalNotesProvider.post(id, ctx): Promise<IFiscalNote>` · `.reverse(id, ctx): Promise<IFiscalNote>` · `IPostContext`

> O mock recebe o catálogo por parâmetro (`IPostContext`) em vez de importar o mock de peças: manter as fatias desacopladas evita ciclo de import, e o hook já tem as peças em mãos.

- [ ] **Step 1: Estender o contrato**

Em `src/providers/data/contracts/fiscalNotes.ts`:

```ts
import type { IPart } from "@/shared/types";

/** Catálogo necessário para calcular o efeito, resolvido pelo chamador. */
export interface IPostContext {
  parts: IPart[];
}
```

E na interface, depois de `cancel`:

```ts
  /**
   * Lança a nota: valida, aplica saldo e custo médio, grava o que a
   * conferência aprendeu e marca a nota como imutável (RF-100).
   * Recusa com erro explícito quando há item pendente.
   */
  post(id: ID, ctx: IPostContext): Promise<IFiscalNote>;
  /** Estorna (RF-101): desfaz o efeito e devolve a nota para conferência. */
  reverse(id: ID, ctx: IPostContext): Promise<IFiscalNote>;
```

Exportar `IPostContext` nos dois barrels (`contracts/index.ts` e `providers/data/index.ts`).

- [ ] **Step 2: Escrever o teste (vai falhar)**

`src/providers/data/impl/mock/fiscalNotes.post.test.ts` — cobrindo: lança e marca imutável, recusa item não conferido, recusa nota já lançada, aplica saldo e custo médio nas peças do contexto, e o estorno desfaz.

```ts
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

  it("lança a nota e carimba quem lançou", async () => {
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
});
```

- [ ] **Step 3: Implementar no mock**

Em `src/providers/data/impl/mock/fiscalNotes.ts`, importar o motor e acrescentar os dois métodos:

```ts
import { computePostEffects, validateForPosting } from "@/features/fiscal-notes/engine/postEffects";
```

```ts
  async post(id: ID, ctx: IPostContext): Promise<IFiscalNote> {
    const current = notes.find((n) => n.id === id);
    if (!current) throw new Error(`[mock] fiscalNotes.post(${id}): nota não encontrada`);
    if (current.status === "lancada") {
      throw new Error(`[mock] fiscalNotes.post(${id}): nota já lançada — corrigir é estornar`);
    }

    const validation = validateForPosting(current);
    if (!validation.ok) {
      throw new Error(
        `[mock] fiscalNotes.post(${id}): nota com ${validation.blockers.length} item(ns) por conferir`,
      );
    }

    // Calculado aqui para o mock refletir o mesmo efeito da RPC.
    const partsById = new Map(ctx.parts.map((p) => [p.id, p]));
    computePostEffects(current, partsById);

    const updated: IFiscalNote = {
      ...current,
      status: "lancada",
      postedAt: new Date().toISOString(),
      postedBy: "mock-seller",
      updatedAt: new Date().toISOString(),
    };
    notes = notes.map((n) => (n.id === id ? updated : n));
    return updated;
  },

  async reverse(id: ID, _ctx: IPostContext): Promise<IFiscalNote> {
    const current = notes.find((n) => n.id === id);
    if (!current) throw new Error(`[mock] fiscalNotes.reverse(${id}): nota não encontrada`);
    if (current.status !== "lancada") {
      throw new Error(`[mock] fiscalNotes.reverse(${id}): só nota lançada pode ser estornada`);
    }

    const { postedAt: _postedAt, postedBy: _postedBy, ...rest } = current;
    const updated: IFiscalNote = {
      ...rest,
      status: "conferencia",
      updatedAt: new Date().toISOString(),
    };
    notes = notes.map((n) => (n.id === id ? updated : n));
    return updated;
  },
```

- [ ] **Step 4: Rodar e commitar**

```bash
bun run test -- src/providers/data/impl/mock/
git add src/providers/data/
git commit -m "feat(fiscal-notes): add post and reverse to the notes contract and mock"
```

---

### Task 4: RPC de lançamento e estorno

**Files:**
- Create: `supabase/migrations/20260817140000_fiscal_note_posting.sql`
- Modify: `src/providers/data/impl/supabase/fiscalNotes.ts`

> ⚠️ **Não aplicar.** O arquivo fica aguardando OK explícito do dono.

- [ ] **Step 1: Escrever a migration**

`supabase/migrations/20260817140000_fiscal_note_posting.sql`:

```sql
-- PRD-216 (Tally) — lançamento e estorno da nota de entrada (RF-100/RF-101).
--
-- Tudo ou nada: valida, cria as peças novas, grava o que a conferência
-- aprendeu, recalcula saldo e custo médio e marca a nota imutável. Uma única
-- transação — meia entrada lançada é pior que entrada nenhuma.
--
-- NÃO cria movimentação: `entrada_compra` continua DERIVADO das notas
-- lançadas em deriveInventoryMovements (RF-102), como as saídas já são
-- derivadas dos pedidos.

create or replace function public.post_fiscal_note(p_note_id uuid)
returns public.fiscal_notes
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_note      public.fiscal_notes;
  v_seller    uuid := public.current_seller_id();
  v_item      public.fiscal_note_items;
  v_pending   integer;
  v_target    uuid;
  v_factor    numeric;
  v_charges   numeric;
  v_qty       numeric;
  v_unit_cost numeric;
  v_stock     integer;
  v_avg       numeric;
begin
  if v_seller is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_note from public.fiscal_notes where id = p_note_id for update;
  if not found then
    raise exception 'fiscal note not found' using errcode = 'P0002';
  end if;

  if v_note.store_id <> public.current_store_id() or not public.is_staff() then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  if v_note.status <> 'conferencia' then
    raise exception 'nota % nao esta em conferencia', v_note.number using errcode = 'P0001';
  end if;

  -- Espelha validateForPosting() do engine: item pendente, fator ausente ou
  -- fracionamento sem destino barram o lancamento.
  select count(*) into v_pending
  from public.fiscal_note_items i
  where i.note_id = p_note_id
    and (
      i.confirmed = false
      or (i.part_id is null and i.new_part_draft is null)
      or (i.conversion_mode <> 'direto' and coalesce(i.conversion_factor, 0) <= 0)
      or (i.conversion_mode = 'frac' and i.conversion_target_part_id is null)
    );
  if v_pending > 0 then
    raise exception 'nota % tem % item(ns) por conferir', v_note.number, v_pending
      using errcode = 'P0001';
  end if;

  -- Encargos rateados por valor (RC-01), calculados uma vez para a nota.
  v_charges := coalesce(v_note.freight, 0) + coalesce(v_note.ipi, 0) - coalesce(v_note.discount, 0);

  for v_item in
    select * from public.fiscal_note_items where note_id = p_note_id order by seq
  loop
    -- Peca nova nasce aqui, com NCM e custo da nota; categoria e preco de
    -- venda ficam para depois, de proposito.
    if v_item.part_id is null and v_item.new_part_draft is not null then
      insert into public.parts (
        sku, name, brand, supplier, unit_cost, unit_price, margin_percent,
        unit_of_measure, fiscal, stock_available, stock_minimum, division,
        active, store_id
      )
      values (
        'NF-' || v_note.number || '-' || v_item.seq,
        v_item.new_part_draft ->> 'name',
        'A definir', 'A definir', 0, 0, 0,
        coalesce(v_item.new_part_draft ->> 'unitOfMeasure', 'UN'),
        case when v_item.ncm is null then null
             else jsonb_build_object('ncm', v_item.ncm) end,
        0, 0, v_note.division, true, v_note.store_id
      )
      returning id into v_target;

      update public.fiscal_note_items set part_id = v_target where id = v_item.id;
      v_item.part_id := v_target;
    end if;

    v_target := case when v_item.conversion_mode = 'frac'
                     then v_item.conversion_target_part_id
                     else v_item.part_id end;
    if v_target is null then
      continue;
    end if;

    v_factor := case when v_item.conversion_mode = 'direto' then 1
                     else v_item.conversion_factor end;
    v_qty := round(v_item.quantity * v_factor, 2);
    if v_qty = 0 then
      continue;
    end if;

    -- RC-02: custo unitario com rateio, sobre a quantidade convertida.
    v_unit_cost := (
      v_item.total_value
      + case when coalesce(v_note.products_total, 0) = 0 then 0
             else v_charges * (v_item.total_value / v_note.products_total) end
    ) / v_qty;

    select coalesce(stock_available, 0), coalesce(average_cost, 0)
      into v_stock, v_avg
    from public.parts where id = v_target for update;

    -- RC-04: media ponderada; saldo ou media ausentes caem no custo da entrada.
    update public.parts
    set stock_available = v_stock + v_qty::integer,
        average_cost = case
          when v_stock <= 0 or v_avg <= 0 then v_unit_cost
          else (v_stock * v_avg + v_qty * v_unit_cost) / (v_stock + v_qty)
        end,
        updated_at = now()
    where id = v_target;

    -- O vinculo aprendido: da proxima nota deste fornecedor aplica sozinho.
    if v_item.part_id is not null then
      insert into public.supplier_part_codes (supplier_id, supplier_code, part_id, created_by)
      values (v_note.supplier_id, v_item.supplier_code, v_item.part_id, v_seller)
      on conflict (supplier_id, supplier_code) do nothing;
    end if;

    if v_item.conversion_mode <> 'direto' and v_item.part_id is not null then
      insert into public.supplier_conversion_rules (
        supplier_id, part_id, mode, from_unit, factor, to_unit, target_part_id, applied_count
      )
      values (
        v_note.supplier_id, v_item.part_id, v_item.conversion_mode, v_item.unit,
        v_item.conversion_factor, coalesce(v_item.conversion_unit, v_item.unit),
        v_item.conversion_target_part_id, 1
      )
      on conflict (supplier_id, part_id, from_unit)
      do update set applied_count = public.supplier_conversion_rules.applied_count + 1,
                    updated_at = now();
    end if;
  end loop;

  update public.fiscal_notes
  set status = 'lancada', posted_at = now(), posted_by = v_seller, updated_at = now()
  where id = p_note_id
  returning * into v_note;

  return v_note;
end;
$function$;

comment on function public.post_fiscal_note(uuid) is
  'PRD-216 RF-100: lanca a nota numa transacao. NAO cria movimentacao — entrada_compra e derivado das notas lancadas.';

create or replace function public.reverse_fiscal_note(p_note_id uuid)
returns public.fiscal_notes
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_note      public.fiscal_notes;
  v_seller    uuid := public.current_seller_id();
  v_item      public.fiscal_note_items;
  v_target    uuid;
  v_factor    numeric;
  v_qty       numeric;
begin
  if v_seller is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_note from public.fiscal_notes where id = p_note_id for update;
  if not found then
    raise exception 'fiscal note not found' using errcode = 'P0002';
  end if;

  if v_note.store_id <> public.current_store_id() or not public.is_staff() then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  if v_note.status <> 'lancada' then
    raise exception 'nota % nao esta lancada', v_note.number using errcode = 'P0001';
  end if;

  for v_item in
    select * from public.fiscal_note_items where note_id = p_note_id order by seq
  loop
    v_target := case when v_item.conversion_mode = 'frac'
                     then v_item.conversion_target_part_id
                     else v_item.part_id end;
    if v_target is null then
      continue;
    end if;

    v_factor := case when v_item.conversion_mode = 'direto' then 1
                     else v_item.conversion_factor end;
    v_qty := round(v_item.quantity * v_factor, 2);

    -- Devolve o saldo. O custo medio NAO volta ao valor anterior: media
    -- ponderada nao tem inversa exata, e reconstruir daria numero falso. O
    -- estorno corrige o saldo; o custo se corrige na proxima entrada.
    update public.parts
    set stock_available = greatest(0, coalesce(stock_available, 0) - v_qty::integer),
        updated_at = now()
    where id = v_target;
  end loop;

  update public.fiscal_notes
  set status = 'conferencia', posted_at = null, posted_by = null, updated_at = now()
  where id = p_note_id
  returning * into v_note;

  return v_note;
end;
$function$;

comment on function public.reverse_fiscal_note(uuid) is
  'PRD-216 RF-101: estorna a nota. Devolve saldo; o custo medio nao e revertido — media ponderada nao tem inversa exata.';

revoke all on function public.post_fiscal_note(uuid) from public, anon;
revoke all on function public.reverse_fiscal_note(uuid) from public, anon;
grant execute on function public.post_fiscal_note(uuid) to authenticated;
grant execute on function public.reverse_fiscal_note(uuid) to authenticated;
```

- [ ] **Step 2: Ligar no provider Supabase**

Em `src/providers/data/impl/supabase/fiscalNotes.ts`, acrescentar os dois métodos (o `ctx` é ignorado — o Postgres já tem o catálogo):

```ts
  async post(id: ID, _ctx: IPostContext): Promise<IFiscalNote> {
    const { data, error } = await getSupabaseClient().rpc("post_fiscal_note", {
      p_note_id: id,
    });
    if (error) throw new Error(`[supabase] fiscalNotes.post(${id}) failed: ${error.message}`);
    const row = data as unknown as FiscalNoteRow;
    const [items, duplicates] = await hydrate(row.id);
    return rowToNote(row, items, duplicates);
  },

  async reverse(id: ID, _ctx: IPostContext): Promise<IFiscalNote> {
    const { data, error } = await getSupabaseClient().rpc("reverse_fiscal_note", {
      p_note_id: id,
    });
    if (error) throw new Error(`[supabase] fiscalNotes.reverse(${id}) failed: ${error.message}`);
    const row = data as unknown as FiscalNoteRow;
    const [items, duplicates] = await hydrate(row.id);
    return rowToNote(row, items, duplicates);
  },
```

- [ ] **Step 3: Verificar tipos e commitar**

```bash
bunx tsc --noEmit 2>&1 | grep -E "fiscal"
git add supabase/migrations/20260817140000_fiscal_note_posting.sql src/providers/data/impl/supabase/fiscalNotes.ts
git commit -m "feat(fiscal-notes): add transactional posting and reversal RPCs"
```

---

### Task 5: Hook da conferência

**Files:**
- Create: `src/features/fiscal-notes/hooks/useNoteReview.ts`

**Interfaces:**
- Produces: `useNoteReview(noteId)` → `{ note, parts, effects, validation, isLoading, confirmItem, confirmLinked, post, reverse, isMutating }`

- [ ] **Step 1: Escrever o hook**

`src/features/fiscal-notes/hooks/useNoteReview.ts`:

```ts
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FETCH_ALL_PAGE_SIZE,
  recordAuditLog,
  useFiscalNotesProvider,
  usePartsProvider,
  type IUpdateFiscalNoteItemPatch,
} from "@/providers/data";
import { useCurrentStore } from "@/features/multistore";
import type { ID } from "@/shared/types";
import { autoConfirmable, computePostEffects, validateForPosting } from "../engine/postEffects";

/**
 * Estado da conferência de uma nota (PRD-216, Fase 3).
 *
 * O catálogo é buscado inteiro porque o efeito de cada item precisa do saldo e
 * do custo médio da peça de destino — e porque o mock recebe as peças por
 * parâmetro, para não acoplar as fatias do provider.
 */
export function useNoteReview(noteId: ID | undefined) {
  const notesProvider = useFiscalNotesProvider();
  const partsProvider = usePartsProvider();
  const { currentStoreId } = useCurrentStore();
  const queryClient = useQueryClient();
  const [isMutating, setIsMutating] = useState(false);

  const noteQuery = useQuery({
    queryKey: ["fiscal-notes", "detail", noteId],
    queryFn: () => notesProvider.get(noteId as ID),
    enabled: Boolean(noteId),
  });

  const partsQuery = useQuery({
    queryKey: ["fiscal-notes", "review-parts", currentStoreId],
    queryFn: () =>
      partsProvider.list({ pageSize: FETCH_ALL_PAGE_SIZE, active: true }).then((r) => r.data),
    enabled: Boolean(noteId),
  });

  const note = noteQuery.data;
  const parts = useMemo(() => partsQuery.data ?? [], [partsQuery.data]);
  const partsById = useMemo(() => new Map(parts.map((p) => [p.id, p])), [parts]);

  const validation = useMemo(
    () => (note ? validateForPosting(note) : { ok: false, blockers: [] }),
    [note],
  );
  const effects = useMemo(
    () => (note ? computePostEffects(note, partsById) : null),
    [note, partsById],
  );

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["fiscal-notes"] });
    await queryClient.invalidateQueries({ queryKey: ["inventory-movement"] });
  }

  async function run<T>(fn: () => Promise<T>): Promise<T> {
    setIsMutating(true);
    try {
      const result = await fn();
      await refresh();
      return result;
    } finally {
      setIsMutating(false);
    }
  }

  return {
    note,
    parts,
    effects,
    validation,
    isLoading: noteQuery.isPending || partsQuery.isPending,
    isError: noteQuery.isError,
    isMutating,

    confirmItem: (itemId: ID, patch: IUpdateFiscalNoteItemPatch) =>
      run(() => notesProvider.updateItem(itemId, { ...patch, confirmed: true })),

    /** Resolve em lote só o que veio vinculado pelo código do fornecedor. */
    confirmLinked: () =>
      run(async () => {
        if (!note) return 0;
        const ids = autoConfirmable(note);
        for (const id of ids) await notesProvider.updateItem(id, { confirmed: true });
        return ids.length;
      }),

    post: () =>
      run(async () => {
        if (!note) throw new Error("nota não carregada");
        const posted = await notesProvider.post(note.id, { parts });
        void recordAuditLog({
          actorId: posted.postedBy ?? "system",
          action: "fiscal_note.post",
          resource: "supplies",
          resourceId: posted.id,
          storeId: posted.storeId,
          after: { number: posted.number, total: posted.total },
        });
        return posted;
      }),

    reverse: () =>
      run(async () => {
        if (!note) throw new Error("nota não carregada");
        const before = { status: note.status, postedBy: note.postedBy };
        const reversed = await notesProvider.reverse(note.id, { parts });
        void recordAuditLog({
          actorId: note.postedBy ?? "system",
          action: "fiscal_note.reverse",
          resource: "supplies",
          resourceId: reversed.id,
          storeId: reversed.storeId,
          before,
        });
        return reversed;
      }),
  };
}
```

- [ ] **Step 2: Verificar tipos e commitar**

```bash
bunx tsc --noEmit 2>&1 | grep -E "fiscal-notes"
git add src/features/fiscal-notes/hooks/useNoteReview.ts
git commit -m "feat(fiscal-notes): add the note review hook with posting and audit"
```

---

### Task 6: Tela de conferência

**Files:**
- Create: `src/features/fiscal-notes/components/review/NoteItemsTable.tsx`
- Create: `src/features/fiscal-notes/components/review/NoteItemDrawer.tsx`
- Create: `src/features/fiscal-notes/components/review/NoteReviewSidebar.tsx`
- Create: `src/features/fiscal-notes/pages/FiscalNoteReviewPage.tsx`
- Create: `src/routes/app.suprimentos.entrada.$id.tsx`
- Modify: `src/features/fiscal-notes/i18n/pt-BR.ts`
- Modify: `src/features/fiscal-notes/components/list/FiscalNotesTable.tsx` (linha clicável)
- Modify: `src/features/fiscal-notes/pages/FiscalNotesListPage.tsx` (navegar para a conferência)
- Modify: `src/features/shell/config/routes.ts`
- Modify: `src/features/fiscal-notes/index.ts`

> As três decisões da gaveta são as do kit: **vínculo** (catálogo ou produto novo), **conversão** (direto · converter · fracionar) e a **prévia do efeito** — quantidade convertida, custo com rateio e delta sobre o custo médio atual. Vermelho só no que bloqueia.

- [ ] **Step 1: Acrescentar as strings da conferência ao `i18n/pt-BR.ts`**

Dentro de `FISCAL_NOTES_STRINGS`, um bloco `review` com: título, `confirmLinked`, `postCta`, `postBlocked(n)`, `reverseCta`, rótulos da gaveta (`linkSection`, `linkToCatalog`, `createNew`, `conversionSection`, `direct`, `convert`, `fraction`, `factorLabel`, `targetLabel`, `previewTitle`, `previewCost`, `previewDelta`), o aviso de imutabilidade e os motivos de bloqueio por `PostBlockerReason`.

- [ ] **Step 2: Escrever `NoteItemDrawer`** — `Sheet` do shadcn com os dois segmentos (vínculo, conversão), a evidência da IA quando houver, e o cartão de prévia alimentado por `computeItemEffect`. Botão de confirmar desabilitado enquanto a escolha estiver incompleta.

- [ ] **Step 3: Escrever `NoteItemsTable`** — uma linha por item com código, descrição, NCM/CFOP, quantidade × unitário, vínculo (chip por `linkMode`), efeito no estoque (`16 CX → 192 UN` e `R$ 47,20/UN c/ rateio`) e o botão Resolver/Rever. `definir conversão` em `text-severity-critical` quando o fator falta.

- [ ] **Step 4: Escrever `NoteReviewSidebar`** — cartão do fornecedor, totais da nota (produtos, frete, IPI, desconto, total), duplicatas com o aviso de que os títulos só existem depois do lançamento, e o botão `Lançar entrada` desabilitado enquanto `validation.ok` for falso, com a contagem de pendências no rótulo.

- [ ] **Step 5: Escrever a página e a rota**, montando header glass + progresso de conferência + o banner verde de efeitos quando a nota está lançada, com o botão de estorno.

- [ ] **Step 6: Ligar a lista à conferência** — a linha da tabela passa a navegar para `/app/suprimentos/entrada/$id`, e a fila de importação troca o texto "A conferência entra na próxima fase" pelo botão `Conferir entrada`.

- [ ] **Step 7: Verificar e commitar**

```bash
bunx tsc --noEmit 2>&1 | grep -E "fiscal-notes|suprimentos"
bun run build 2>&1 | tail -2
git add src/features/fiscal-notes/ src/routes/app.suprimentos.entrada.\$id.tsx src/features/shell/config/routes.ts src/routeTree.gen.ts
git commit -m "feat(fiscal-notes): add the note review screen with the item drawer"
```

---

### Task 7: Gate da fase

- [ ] **Step 1: Delta de tipos**

```bash
bunx tsc --noEmit 2>&1 | grep -iE "fiscal|supplies|suprimentos|inventory-movement"
```

Esperado: nenhuma linha.

- [ ] **Step 2: Suíte, build e lint**

```bash
bun run test
bun run build
bunx eslint src/features/fiscal-notes src/features/inventory-movement src/providers/data
```

Esperado: verde, verde, zero erros (o ruído de `Delete ␍` do `autocrlf` é ambiental e pré-existente — comparar com um diretório não tocado antes de concluir qualquer coisa).

- [ ] **Step 3: Tokens semânticos**

```bash
grep -rnE "#[0-9a-fA-F]{6}|--gallo-" src/features/fiscal-notes/ ; echo "$? (1 = limpo)"
```

- [ ] **Step 4: Espelho da Edge**

```bash
bun run sync:fiscal && git status --short supabase/functions/_shared/fiscal/
```

Se acusar mudança, o engine foi tocado depois do último sync — commitar o espelho junto.

- [ ] **Step 5: Push e PR**

```bash
git push -u origin claude/fiscal-notes-fase3
```

PR com **base `claude/fiscal-notes-fase2`**.

---

## Self-Review

**1. Cobertura da spec (Fase 3).** RF-100 (RPC transacional) → Tasks 3 e 4. RF-101 (estorno) → Tasks 3 e 4. RF-102 (`entrada_compra` derivado) → Task 2. RF-114 (auditoria) → Task 5. Gaveta de vínculo · conversão · fracionamento → Task 6. Prévia do efeito → Tasks 1 e 6. `Confirmar vinculados` em lote → `autoConfirmable` (Task 1) + `confirmLinked` (Task 5). Entregável declarado ("lançar move saldo, recalcula custo médio e faz `entrada_compra` aparecer em Movimentação") → Tasks 2, 3 e 4.

**Critérios de aceite cobertos:** CA-04 (botão travado com pendência) em `validateForPosting`; CA-05 (16 CX × 12 = 192 UN com rateio) e CA-06 (fracionado credita o destino) em `computeItemEffect`; CA-07 (média ponderada) em `computePostEffects`; CA-08 (`entrada_compra` com `invoiceNumber`) na Task 2; CA-09 (imutável, estorno devolve) na Task 3; CA-10 (a segunda nota aplica o aprendido) nas `learnedCodes`/`learnedRules` da Task 1, gravadas pela RPC.

**2. Placeholders.** As Tasks 1 a 5 trazem o arquivo inteiro. A Task 6 descreve os quatro componentes por responsabilidade e conteúdo em vez de transcrevê-los: são UI sem regra de negócio — tudo que decide vive no engine já escrito — e o padrão visual é o das telas da Fase 2, no mesmo repositório. Cada passo nomeia exatamente os elementos, os estados e a fonte dos dados.

**3. Consistência de tipos.** `IPostContext` é o mesmo em contrato, mock e Supabase. `computeItemEffect` recebe `(item, note, part | undefined)` e é chamado assim na Task 2 e na Task 6. `IPostEffects.parts[].newStock` é o que a sidebar mostra e o que a RPC grava. `autoConfirmable` devolve `ID[]`, consumido por `confirmLinked`.

**4. Riscos com antídoto no plano.** A RPC e o `validateForPosting` do engine precisam concordar — a migration cita a função por nome e repete a mesma condição em SQL. O estorno **não** reverte o custo médio, e isso é decisão registrada em `comment on function`, não esquecimento: média ponderada não tem inversa exata.
