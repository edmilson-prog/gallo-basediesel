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

export function computePostEffects(note: IFiscalNote, partsById: Map<ID, IPart>): IPostEffects {
  const byPart = new Map<ID, IPartEffect>();
  const learnedCodes: ILearnedCode[] = [];
  const learnedRules: ILearnedRule[] = [];

  for (const item of note.items) {
    const targetId = targetPartOf(item);
    if (!targetId) continue;

    const target = partsById.get(targetId);
    const effect = computeItemEffect(item, note, target);
    if (effect.stockQuantity === null || effect.unitCost === null) continue;

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
