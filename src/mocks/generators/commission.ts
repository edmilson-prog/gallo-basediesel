import type { ICommission, IOrder, ID } from "@/shared/types";
import { monthRef, pickWeighted, randomISO, type ISeededContext } from "./utils";

const STATUS_WEIGHTS = [
  { value: "pago" as const, weight: 6 },
  { value: "aprovado" as const, weight: 2 },
  { value: "pendente" as const, weight: 2 },
  { value: "contestado" as const, weight: 1 },
];

/**
 * Generate one commission for a paid order. Rate is randomized within the
 * realistic 3–8% band; base is revenue (most common contract on the MVP).
 */
export function generateCommission(
  ctx: ISeededContext,
  options: { sequence: number; order: IOrder },
): ICommission {
  const id: ID = `comm-${String(options.sequence + 1).padStart(4, "0")}`;
  const rate = ctx.int(30, 80) / 1000;
  const baseValue = options.order.total;
  const value = round(baseValue * rate);
  const period = monthRef(new Date(options.order.createdAt));

  return {
    id,
    storeId: options.order.storeId,
    sellerId: options.order.sellerId,
    orderId: options.order.id,
    baseValue,
    rate,
    value,
    period,
    status: pickWeighted(ctx, STATUS_WEIGHTS),
    notes: undefined,
    createdAt: randomISO(ctx, new Date(options.order.createdAt), new Date(options.order.updatedAt)),
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
