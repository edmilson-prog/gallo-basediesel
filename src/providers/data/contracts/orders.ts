import type { ID, IOrder } from "@/shared/types";
import type { IPaginatedResult, IPaginationParams } from "./_shared";

export interface IListOrdersParams extends IPaginationParams {
  storeId?: ID;
  sellerId?: ID;
  customerId?: ID;
  paymentStatus?: IOrder["paymentStatus"];
  fulfillmentStatus?: IOrder["fulfillmentStatus"];
  /** Lower bound (ISO date) on `createdAt`. */
  since?: string;
  /** Upper bound (ISO date) on `createdAt`. */
  until?: string;
}

/**
 * Contract for order access (B2B/B2C).
 *
 * @see ../../../mocks/api/orders.ts
 * @see ../../../../docs/provider-pattern.md
 */
export interface IOrdersProvider {
  list(params?: IListOrdersParams): Promise<IPaginatedResult<IOrder>>;
  get(id: ID): Promise<IOrder>;
  listByCustomer(customerId: ID): Promise<IOrder[]>;
  create(input: Omit<IOrder, "id" | "createdAt" | "updatedAt">): Promise<IOrder>;
  update(id: ID, patch: Partial<IOrder>): Promise<IOrder>;
  delete(id: ID): Promise<void>;
}
