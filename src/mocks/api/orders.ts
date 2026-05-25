import type { ID, IOrder } from "@/shared/types";
import { selectAllOrders, selectOrderById, selectOrdersByCustomer } from "../store/selectors";
import { patchById, removeById, upsert } from "../store/mutations";
import {
  MockNotFoundError,
  paginate,
  runApi,
  type IPaginatedResult,
  type IPaginationParams,
} from "./utils";

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

export const ordersApi = {
  list(params: IListOrdersParams = {}): Promise<IPaginatedResult<IOrder>> {
    return runApi(
      "ordersApi",
      "list",
      () => {
        let all = selectAllOrders();
        if (params.storeId) all = all.filter((o) => o.storeId === params.storeId);
        if (params.sellerId) all = all.filter((o) => o.sellerId === params.sellerId);
        if (params.customerId) all = all.filter((o) => o.customerId === params.customerId);
        if (params.paymentStatus) all = all.filter((o) => o.paymentStatus === params.paymentStatus);
        if (params.fulfillmentStatus)
          all = all.filter((o) => o.fulfillmentStatus === params.fulfillmentStatus);
        if (params.since) all = all.filter((o) => o.createdAt >= params.since!);
        if (params.until) all = all.filter((o) => o.createdAt <= params.until!);
        const sorted = [...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        return paginate(sorted, params);
      },
      { payload: params },
    );
  },

  async get(id: ID): Promise<IOrder> {
    return runApi("ordersApi", "get", () => {
      const found = selectOrderById(id);
      if (!found) throw new MockNotFoundError("order", id);
      return found;
    });
  },

  async listByCustomer(customerId: ID): Promise<IOrder[]> {
    return runApi("ordersApi", "listByCustomer", () => selectOrdersByCustomer(customerId));
  },

  async create(input: Omit<IOrder, "id" | "createdAt" | "updatedAt">): Promise<IOrder> {
    return runApi("ordersApi", "create", () => {
      const now = new Date().toISOString();
      const order: IOrder = {
        ...input,
        id: `order-${crypto.randomUUID()}`,
        createdAt: now,
        updatedAt: now,
      };
      upsert("orders", order);
      return order;
    });
  },

  async update(id: ID, patch: Partial<IOrder>): Promise<IOrder> {
    return runApi("ordersApi", "update", () => {
      const updated = patchById("orders", id, { ...patch, updatedAt: new Date().toISOString() });
      if (!updated) throw new MockNotFoundError("order", id);
      return updated;
    });
  },

  async delete(id: ID): Promise<void> {
    return runApi("ordersApi", "delete", () => {
      const removed = removeById("orders", id);
      if (!removed) throw new MockNotFoundError("order", id);
    });
  },
};
