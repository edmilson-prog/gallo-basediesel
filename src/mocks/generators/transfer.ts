import type { ICarteiraTransfer, ICustomer, ISeller, ID } from "@/shared/types";
import { SEED_STORE_ID } from "../data";
import { daysAgo, pickWeighted, randomDate, randomISO, type ISeededContext } from "./utils";

const TYPE_WEIGHTS = [
  { value: "permanent_individual" as const, weight: 4 },
  { value: "temporary" as const, weight: 3 },
  { value: "permanent_batch" as const, weight: 1 },
];

const REASONS = [
  "Carteira sobrecarregada — redistribuição manual.",
  "Vendedor de férias — repasse temporário.",
  "Cliente preferiu trocar de vendedor.",
  "Reorganização da equipe pelo gestor.",
];

export function generateTransfer(
  ctx: ISeededContext,
  options: { sequence: number; sellers: ISeller[]; customers: ICustomer[]; now?: Date },
): ICarteiraTransfer {
  const type = pickWeighted(ctx, TYPE_WEIGHTS);
  const from = ctx.pick(options.sellers);
  let to = ctx.pick(options.sellers);
  let attempts = 0;
  while (to.id === from.id && attempts < 4) {
    to = ctx.pick(options.sellers);
    attempts += 1;
  }
  const now = options.now ?? new Date();
  const startDate = randomISO(ctx, daysAgo(120, now), now);
  const customerCount = type === "permanent_batch" ? ctx.int(3, 12) : 1;
  const candidates = options.customers.filter((c) => c.sellerId === from.id);
  const picks = candidates.length > 0 ? candidates : options.customers;
  const customerIds: ID[] = [];
  while (customerIds.length < customerCount && customerIds.length < picks.length) {
    const c = ctx.pick(picks);
    if (!customerIds.includes(c.id)) customerIds.push(c.id);
  }

  let endDate: string | undefined;
  let autoRevertAt: string | undefined;
  let status: ICarteiraTransfer["status"] = "active";
  if (type === "temporary") {
    const end = randomDate(ctx, new Date(startDate), new Date(now.getTime() + 30 * 86400_000));
    endDate = end.toISOString();
    autoRevertAt = endDate;
    status = end.getTime() < now.getTime() ? "reverted" : "active";
  }

  return {
    id: `transfer-${String(options.sequence + 1).padStart(4, "0")}`,
    storeId: SEED_STORE_ID,
    type,
    fromSellerId: from.id,
    toSellerId: to.id,
    customerIds,
    reason: ctx.pick(REASONS),
    startDate,
    endDate,
    autoRevertAt,
    status,
    createdBy: "seller-joao-gallo",
    createdAt: startDate,
  };
}
