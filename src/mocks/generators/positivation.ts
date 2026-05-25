import type { ICustomer, IOrder, IPositivation } from "@/shared/types";
import { SEED_STORE_ID } from "../data";
import { daysAgo, monthRef } from "./utils";

/**
 * Monthly positivation snapshot. A customer is "ativo" if they have any order
 * in the last 30 days; "inativo" otherwise. Subcategories split the inativos
 * into recent (31–90d) and old (>90d). New customers are those created in the
 * last 60 days.
 */
export function generatePositivation(
  customers: ICustomer[],
  orders: IOrder[],
  now: Date,
): IPositivation {
  const period = monthRef(now);
  const cutoff30 = daysAgo(30, now).getTime();
  const cutoff90 = daysAgo(90, now).getTime();
  const cutoff60Create = daysAgo(60, now).getTime();

  const lastOrderByCustomer = new Map<string, number>();
  for (const order of orders) {
    const ts = new Date(order.createdAt).getTime();
    const prev = lastOrderByCustomer.get(order.customerId) ?? 0;
    if (ts > prev) lastOrderByCustomer.set(order.customerId, ts);
  }

  const categories: IPositivation["categories"] = {
    ativos: [],
    inativos: [],
    novos: [],
    inativos_recentes: [],
    inativos_antigos: [],
  };

  for (const customer of customers) {
    const lastTs = lastOrderByCustomer.get(customer.id) ?? 0;
    if (lastTs >= cutoff30) categories.ativos.push(customer.id);
    else {
      categories.inativos.push(customer.id);
      if (lastTs >= cutoff90) categories.inativos_recentes.push(customer.id);
      else categories.inativos_antigos.push(customer.id);
    }
    if (new Date(customer.createdAt).getTime() >= cutoff60Create) {
      categories.novos.push(customer.id);
    }
  }

  return {
    id: `positivation-${period}`,
    storeId: SEED_STORE_ID,
    period,
    categories,
    generatedAt: now.toISOString(),
  };
}
