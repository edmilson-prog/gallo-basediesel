import type { ID, IFiscalNote, IPart, ISupplier } from "@/shared/types";
import type { IAnalysisInput, IAnalysisItem, IPurchaseHistoryEntry } from "./analysis";
import { computeItemEffect } from "./postEffects";

/**
 * Montagem do input da Análise (PRD-216, Fase 4).
 *
 * O histórico de compra não existe como tabela: é DERIVADO das notas lançadas,
 * pela mesma razão que a movimentação é (RF-102). O custo de cada ponto da
 * série é o custo por unidade de ESTOQUE, com rateio — nunca o `vUnCom` da
 * nota, que ignora frete e embalagem e produziria uma série mentirosa.
 */

function supplierLabel(supplier: ISupplier | undefined, fallback: ID): string {
  return supplier?.tradeName ?? supplier?.corporateName ?? fallback;
}

/** Rótulo curto do ponto na série: "jul", "ago"… */
function monthLabel(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
}

export function buildPurchaseHistory(
  postedNotes: IFiscalNote[],
  partsById: Map<ID, IPart>,
  suppliersById: Map<ID, ISupplier>,
): Record<ID, IPurchaseHistoryEntry[]> {
  const history: Record<ID, IPurchaseHistoryEntry[]> = {};

  const ordered = postedNotes
    .filter((note) => note.status === "lancada")
    .slice()
    .sort((a, b) => (a.postedAt ?? a.updatedAt).localeCompare(b.postedAt ?? b.updatedAt));

  for (const note of ordered) {
    for (const item of note.items) {
      const targetId = item.conversionMode === "frac" ? item.conversionTargetPartId : item.partId;
      if (!targetId) continue;

      const effect = computeItemEffect(item, note, partsById.get(targetId));
      if (effect.unitCost === null) continue;

      const purchasedAt = note.postedAt ?? note.updatedAt;
      (history[targetId] ??= []).push({
        supplierName: supplierLabel(suppliersById.get(note.supplierId), note.supplierId),
        unitCost: effect.unitCost,
        purchasedAt,
        label: monthLabel(purchasedAt),
      });
    }
  }

  return history;
}

export interface IBuildAnalysisInputArgs {
  /** Nota que está sendo analisada. */
  note: IFiscalNote;
  /** Notas já lançadas, fonte da série de preço. */
  postedNotes: IFiscalNote[];
  partsById: Map<ID, IPart>;
  suppliersById: Map<ID, ISupplier>;
  /** Todas as notas conhecidas, para a verificação de chave duplicada. */
  allNotes: IFiscalNote[];
}

export function buildAnalysisInput(args: IBuildAnalysisInputArgs): IAnalysisInput {
  const { note, postedNotes, partsById, suppliersById, allNotes } = args;
  const supplier = suppliersById.get(note.supplierId);

  const items: IAnalysisItem[] = note.items.map((item) => {
    const targetId = item.conversionMode === "frac" ? item.conversionTargetPartId : item.partId;
    const target = targetId ? partsById.get(targetId) : undefined;
    const effect = computeItemEffect(item, note, target);

    return {
      itemId: item.id,
      partId: targetId,
      partName: target?.name ?? item.newPartDraft?.name ?? item.description,
      description: item.description,
      ncm: item.ncm,
      catalogNcm: target?.fiscal?.ncm,
      unitCost: effect.unitCost,
      stockUnit: effect.stockUnit,
      currentStock: target?.stockAvailable,
    };
  });

  return {
    noteId: note.id,
    accessKey: note.accessKey,
    supplierName: supplierLabel(supplier, note.supplierId),
    supplierIsNew: supplier?.createdFromXml ?? false,
    // A própria chave fica de fora: incluí-la faria toda nota se acusar como
    // duplicada de si mesma.
    knownAccessKeys: allNotes.filter((n) => n.id !== note.id).map((n) => n.accessKey),
    items,
    purchaseHistory: buildPurchaseHistory(postedNotes, partsById, suppliersById),
  };
}
