import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IOrder } from "@/shared/types";

interface ICall {
  table: string;
  op: "insert" | "delete";
}

const calls: ICall[] = [];
let itemsInsertError: { message: string } | null = null;

const ORDER_ROW = {
  store_id: "9c5b94b1-35ad-49bb-b118-8e8fc24abf80",
  customer_id: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
  seller_id: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  payment_status: "pendente",
  fulfillment_status: "pendente",
  origin: "manual",
  division: "parts",
  created_at: "2026-08-18T14:45:00.000Z",
  updated_at: "2026-08-18T14:45:00.000Z",
  order_items: [],
};

vi.mock("@/shared/lib/supabase", () => ({
  getSupabaseClient: () => ({
    from: (table: string) => ({
      insert: () => {
        calls.push({ table, op: "insert" });
        return Promise.resolve({ error: table === "order_items" ? itemsInsertError : null });
      },
      select: () => ({
        eq: () => ({ single: () => Promise.resolve({ data: { ...ORDER_ROW }, error: null }) }),
      }),
      delete: () => ({
        eq: () => {
          calls.push({ table, op: "delete" });
          return Promise.resolve({ error: null });
        },
      }),
    }),
  }),
}));

import { supabaseOrdersProvider as P } from "./orders";

const input = {
  storeId: ORDER_ROW.store_id,
  customerId: ORDER_ROW.customer_id,
  sellerId: ORDER_ROW.seller_id,
  items: [
    {
      id: "oi-8f14e45f-ceea-467a-9d5b-2f1c1d8f3a11-1",
      partId: "0d4f6a1e-5f0c-4a3b-9b2e-1c2d3e4f5a6b",
      partSku: "VOL-1234",
      partName: "Filtro de óleo",
      quantity: 2,
      unitPrice: 52.73,
      unitCost: 36.91,
      discount: 0,
      total: 105.46,
      marginValue: 31.64,
    },
  ],
  subtotal: 105.46,
  discount: 0,
  shipping: 0,
  total: 105.46,
  paymentCondition: "à vista",
  paymentStatus: "pendente",
  fulfillmentStatus: "pendente",
  origin: "manual",
  division: "parts",
} as Omit<IOrder, "id" | "createdAt" | "updatedAt">;

beforeEach(() => {
  calls.length = 0;
  itemsInsertError = null;
});

describe("supabaseOrdersProvider.create", () => {
  // Same shape as quotes.create: the two inserts are not one transaction, so a
  // failed line insert must not leave an itemless order on the customer's ficha.
  it("rolls the parent order back when the items insert fails", async () => {
    itemsInsertError = { message: 'invalid input syntax for type uuid: "oi-8f14"' };

    await expect(P.create(input)).rejects.toThrow(/orders\.create \(items\) failed/);

    expect(calls.filter((c) => c.table === "orders" && c.op === "delete")).toHaveLength(1);
  });

  it("keeps the order when the items insert succeeds", async () => {
    await P.create(input);

    expect(calls.filter((c) => c.op === "delete")).toHaveLength(0);
  });
});
