import type { IInventoryMovement, IOrder, IPart } from "@/shared/types";

export interface IDeriveMovementsContext {
  orders: IOrder[];
  parts: IPart[];
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

    for (let i = 0; i < order.items.length; i += 1) {
      const item = order.items[i];
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
