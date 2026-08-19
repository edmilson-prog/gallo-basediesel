import { describe, expect, it, vi } from "vitest";
import type { IOrder, IQuote } from "@/shared/types";
import type { IOrdersProvider } from "@/providers/data/contracts/orders";
import type { IQuotesProvider } from "@/providers/data/contracts/quotes";

vi.mock("@/features/rbac/utils/auditLog", () => ({ auditLog: vi.fn() }));

import { createOrderFromQuote } from "./createOrderFromQuote";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const quote = {
  id: "8f14e45f-ceea-467a-9d5b-2f1c1d8f3a11",
  storeId: "9c5b94b1-35ad-49bb-b118-8e8fc24abf80",
  number: "OR-2026-0005",
  customerId: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
  sellerId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  items: [
    {
      id: "b9d9da83-71fc-41a2-b794-84f3b07d3616",
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
  status: "aceito",
  origin: "vendedor",
  division: "parts",
  createdAt: "2026-08-18T14:45:00.000Z",
  updatedAt: "2026-08-18T14:45:00.000Z",
} as IQuote;

describe("createOrderFromQuote", () => {
  // `order_items.id` is a uuid column — a synthesized "oi-<quoteId>-<n>" id is
  // rejected by Postgres the moment the order reaches Supabase.
  it("mints canonical uuids for the copied order lines", async () => {
    let createInput: Omit<IOrder, "id" | "createdAt" | "updatedAt"> | undefined;

    const ordersProvider = {
      list: async () => ({ data: [], total: 0, page: 1, pageSize: 1000 }),
      create: async (input: Omit<IOrder, "id" | "createdAt" | "updatedAt">) => {
        createInput = input;
        return { ...input, id: "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed" } as IOrder;
      },
    } as unknown as IOrdersProvider;

    const quotesProvider = {
      get: async () => quote,
      update: async () => quote,
    } as unknown as IQuotesProvider;

    await createOrderFromQuote(quote.id, { ordersProvider, quotesProvider });

    const lines = createInput?.items ?? [];
    expect(lines).toHaveLength(1);
    expect(lines[0]?.id).toMatch(UUID_RE);
  });
});
