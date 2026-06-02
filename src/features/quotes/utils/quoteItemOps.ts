// src/features/quotes/utils/quoteItemOps.ts
import type { ID, IPart, IQuoteItem } from "@/shared/types";
import { round2 } from "./quoteTotals";

/** Sentinel partId used for free (off-catalog) items. */
export const FREE_ITEM_PART_ID = "avulso";

/** Build a quote item from a catalog part. */
export function buildItemFromPart(part: IPart, quantity = 1): IQuoteItem {
  const qty = Math.max(1, Math.floor(quantity) || 1);
  return {
    id: `qi-${crypto.randomUUID()}`,
    partId: part.id,
    partSku: part.sku,
    partName: part.name,
    quantity: qty,
    unitPrice: part.unitPrice,
    discount: 0,
    total: round2(qty * part.unitPrice),
  };
}

/** Build a free (off-catalog) quote item. */
export function buildFreeItem(input: {
  name: string;
  unitPrice: number;
  quantity?: number;
}): IQuoteItem {
  const qty = Math.max(1, Math.floor(input.quantity ?? 1) || 1);
  const price = Math.max(0, input.unitPrice || 0);
  return {
    id: `qi-${crypto.randomUUID()}`,
    partId: FREE_ITEM_PART_ID,
    partSku: "—",
    partName: input.name.trim() || "Item avulso",
    quantity: qty,
    unitPrice: price,
    discount: 0,
    total: round2(qty * price),
  };
}

/**
 * Add a part to the list, or increment quantity if a line for the same partId
 * already exists (free items, partId="avulso", are always appended).
 * Returns a new array and the id of the affected line (for highlight).
 */
export function addOrIncrementItem(
  items: IQuoteItem[],
  part: IPart,
  quantity = 1,
): { items: IQuoteItem[]; affectedId: ID } {
  const qty = Math.max(1, Math.floor(quantity) || 1);
  const existing = items.find((it) => it.partId === part.id && part.id !== FREE_ITEM_PART_ID);
  if (existing) {
    const nextQty = existing.quantity + qty;
    const updated: IQuoteItem = {
      ...existing,
      quantity: nextQty,
      total: round2(nextQty * existing.unitPrice - existing.discount),
    };
    return {
      items: items.map((it) => (it.id === existing.id ? updated : it)),
      affectedId: existing.id,
    };
  }
  const created = buildItemFromPart(part, qty);
  return { items: [...items, created], affectedId: created.id };
}
