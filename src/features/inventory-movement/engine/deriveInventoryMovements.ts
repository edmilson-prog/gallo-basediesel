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

/**
 * Pure derivation: for each paid/partial order, emits one `saida_venda`
 * movement per item; for each returned order, emits one `devolucao`
 * movement per item (positive quantity).
 *
 * No mutation of `IPart.stockAvailable` — movements are read-only.
 */
export function deriveInventoryMovements(ctx: IDeriveMovementsContext): IInventoryMovement[] {
  const partsById = new Map<string, IPart>();
  for (const p of ctx.parts) partsById.set(p.id, p);

  const out: IInventoryMovement[] = [];

  for (const order of ctx.orders) {
    const isPaidLike = order.paymentStatus === "pago" || order.paymentStatus === "parcial";
    const isReturned = order.fulfillmentStatus === "devolvido";

    if (!isPaidLike && !isReturned) continue;

    const baseTimestamp = isReturned
      ? (order.returnedAt ?? order.paidAt ?? order.updatedAt)
      : (order.paidAt ?? order.updatedAt ?? order.createdAt);

    for (const item of order.items) {
      const part = partsById.get(item.partId);
      const partOem = pickPrimaryOemCode(part);

      out.push({
        id: `mov-${order.id}-${item.id}-${isReturned ? "ret" : "out"}`,
        type: isReturned ? "devolucao" : "saida_venda",
        partId: item.partId,
        partName: item.partName,
        partOemCode: partOem,
        // Returns add stock back (positive). Sales remove (negative).
        quantity: isReturned ? item.quantity : -item.quantity,
        orderId: order.id,
        orderNumber: order.number,
        performedBy: order.sellerId,
        performedAt: baseTimestamp,
        storeId: order.storeId,
        notes: isReturned ? order.returnReason : undefined,
      });
    }
  }

  // Segunda fonte do ledger: nota fiscal lançada (PRD-216 RF-102). O tipo
  // `entrada_compra` e o campo `invoiceNumber` estavam reservados desde o
  // PRD-052 — é aqui que saem do limbo, sem tabela nova.
  for (const note of ctx.fiscalNotes ?? []) {
    if (note.status !== "lancada") continue;

    for (const item of note.items) {
      const targetId = item.conversionMode === "frac" ? item.conversionTargetPartId : item.partId;
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

  // Cronological reverse — most recent first.
  out.sort((a, b) => (a.performedAt < b.performedAt ? 1 : a.performedAt > b.performedAt ? -1 : 0));
  return out;
}

function pickPrimaryOemCode(part?: IPart): string | undefined {
  if (!part) return undefined;
  const codes = part.oemCodes;
  if (!codes || codes.length === 0) return undefined;
  return codes[0];
}
