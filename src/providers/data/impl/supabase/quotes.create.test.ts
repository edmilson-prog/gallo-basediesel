import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IQuote } from "@/shared/types";

interface ICall {
  table: string;
  op: "insert" | "delete";
  payload?: unknown;
}

const calls: ICall[] = [];
let itemsInsertError: { message: string } | null = null;

const PARENT_ROW = {
  store_id: "9c5b94b1-35ad-49bb-b118-8e8fc24abf80",
  number: "OR-2026-0005",
  status: "rascunho",
  origin: "vendedor",
  division: "parts",
  created_at: "2026-08-18T14:45:00.000Z",
  updated_at: "2026-08-18T14:45:00.000Z",
};

vi.mock("@/shared/lib/supabase", () => ({
  getSupabaseClient: () => ({
    from: (table: string) => ({
      insert: (payload: unknown) => {
        calls.push({ table, op: "insert", payload });
        if (table === "quote_items") return Promise.resolve({ error: itemsInsertError });
        return {
          select: () => ({
            single: () => Promise.resolve({ data: { ...PARENT_ROW }, error: null }),
          }),
        };
      },
      select: () => ({
        eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }),
      }),
      delete: () => ({
        eq: (column: string, value: unknown) => {
          calls.push({ table, op: "delete", payload: { column, value } });
          return Promise.resolve({ error: null });
        },
      }),
    }),
  }),
}));

import { supabaseQuotesProvider as P } from "./quotes";

const input = {
  storeId: PARENT_ROW.store_id,
  number: PARENT_ROW.number,
  customerId: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
  sellerId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  items: [
    {
      id: "qi-b9d9da83-71fc-41a2-b794-84f3b07d3616",
      partId: "0d4f6a1e-5f0c-4a3b-9b2e-1c2d3e4f5a6b",
      partSku: "VOL-1234",
      partName: "Filtro de óleo",
      quantity: 2,
      unitPrice: 52.73,
      discount: 0,
      total: 105.46,
    },
  ],
  subtotal: 105.46,
  discount: 0,
  shipping: 0,
  total: 105.46,
  paymentCondition: "à vista",
  validUntil: "2026-08-25T23:59:59.000Z",
  status: "rascunho",
  origin: "vendedor",
  division: "parts",
} as Omit<IQuote, "id" | "createdAt" | "updatedAt">;

beforeEach(() => {
  calls.length = 0;
  itemsInsertError = null;
});

describe("supabaseQuotesProvider.create", () => {
  it("inserts the line items without the client-side ids (the column is uuid)", async () => {
    await P.create(input);

    const itemsInsert = calls.find((c) => c.table === "quote_items" && c.op === "insert");
    expect(itemsInsert).toBeDefined();
    const rows = itemsInsert?.payload as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).not.toHaveProperty("id");
  });

  // Without the compensating delete the parent row survives an item failure and
  // the seller is left with an empty draft they never asked for.
  it("rolls the parent quote back when the items insert fails", async () => {
    itemsInsertError = { message: 'invalid input syntax for type uuid: "qi-b9d9"' };

    await expect(P.create(input)).rejects.toThrow(/quotes\.create \(items\) failed/);

    const rollback = calls.find((c) => c.table === "quotes" && c.op === "delete");
    expect(rollback).toBeDefined();
    expect((rollback?.payload as { column: string }).column).toBe("id");
  });
});
