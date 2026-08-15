import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * A carteira transfer is not just an audit row: creating it MOVES the customers
 * to the destination seller, and reverting/expiring moves them back. The mock
 * backend has always done this (`reassignCustomers` in mocks/api/transfers.ts);
 * the supabase provider used to only write the audit row, so a "successful"
 * transfer left the customer with the old seller — a silent no-op.
 */

type QueryResult = { data?: unknown; error?: unknown; count?: number };

interface CustomersUpdateCall {
  patch: Record<string, unknown>;
  ids: string[];
  /** Guard on the current owner, when the call narrows by seller. */
  eqSellerId?: string;
}

const transfersInsert = vi.fn();
const transfersUpdate = vi.fn();
const transfersDelete = vi.fn();
const customersUpdate = vi.fn<(call: CustomersUpdateCall) => QueryResult>();

/** Chainable stub mimicking the postgrest builder surface the provider uses. */
function makeFrom() {
  return vi.fn((table: string) => {
    if (table === "customers") {
      return {
        update(patch: Record<string, unknown>) {
          const call: CustomersUpdateCall = { patch, ids: [] };
          const builder = {
            in(_col: string, ids: string[]) {
              call.ids = ids;
              return builder;
            },
            eq(col: string, value: string) {
              if (col === "seller_id") call.eqSellerId = value;
              return builder;
            },
            select() {
              return builder;
            },
            then(resolve: (r: QueryResult) => unknown) {
              return Promise.resolve(customersUpdate(call)).then(resolve);
            },
          };
          return builder;
        },
      };
    }
    // carteira_transfers
    return {
      insert: transfersInsert,
      update: transfersUpdate,
      delete: transfersDelete,
    };
  });
}

let from = makeFrom();

vi.mock("@/shared/lib/supabase", () => ({
  getSupabaseClient: () => ({ from: (table: string) => from(table) }),
}));

import { supabaseTransfersProvider as P } from "./transfers";

const STORE = "00000000-0000-0000-0000-0000000000s1";
const FROM_SELLER = "11111111-1111-1111-1111-111111111111";
const TO_SELLER = "22222222-2222-2222-2222-222222222222";
const ACTOR = "33333333-3333-3333-3333-333333333333";

function transferRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "t-1",
    store_id: STORE,
    type: "permanent_individual",
    from_seller_id: FROM_SELLER,
    to_seller_id: TO_SELLER,
    customer_ids: ["c-1"],
    reason: "Teste",
    start_date: "2026-07-23T00:00:00.000Z",
    end_date: null,
    auto_revert_at: null,
    status: "active",
    created_by: ACTOR,
    created_at: "2026-07-23T00:00:00.000Z",
    ...overrides,
  };
}

/** `.insert(row).select(COLUMNS).single()` */
function mockInsertOk(row = transferRow()) {
  transfersInsert.mockReturnValue({
    select: () => ({ single: () => Promise.resolve({ data: row, error: null }) }),
  });
}

/** `.update(patch).eq('id',…).eq('status','active').select(COLUMNS).single()` */
function mockTransferUpdate(result: QueryResult) {
  transfersUpdate.mockImplementation(() => {
    const builder = {
      eq: () => builder,
      select: () => builder,
      single: () => Promise.resolve(result),
    };
    return builder;
  });
}

function mockTransferDelete() {
  transfersDelete.mockImplementation(() => {
    const builder = {
      eq: () => Promise.resolve({ error: null }),
    };
    return builder;
  });
}

const baseInput = {
  storeId: STORE,
  type: "permanent_individual" as const,
  fromSellerId: FROM_SELLER,
  toSellerId: TO_SELLER,
  customerIds: ["c-1"],
  reason: "Teste",
  createdBy: ACTOR,
};

beforeEach(() => {
  from = makeFrom();
  transfersInsert.mockReset();
  transfersUpdate.mockReset();
  transfersDelete.mockReset();
  customersUpdate.mockReset();
  customersUpdate.mockReturnValue({ data: [{ id: "c-1" }], error: null });
  mockTransferDelete();
});

describe("supabaseTransfersProvider.create — applies the transfer", () => {
  it("reassigns the listed customers to the destination seller", async () => {
    mockInsertOk();

    await P.create(baseInput);

    expect(customersUpdate).toHaveBeenCalledTimes(1);
    const call = customersUpdate.mock.calls[0]![0];
    expect(call.patch).toEqual({ seller_id: TO_SELLER });
    expect(call.ids).toEqual(["c-1"]);
  });

  it("rejects a missing actor instead of letting the FK to sellers blow up as a 409", async () => {
    mockInsertOk();

    await expect(P.create({ ...baseInput, createdBy: "" })).rejects.toThrow(
      /createdBy is required/,
    );
    expect(transfersInsert).not.toHaveBeenCalled();
  });

  it("rejects a customer with no current owner instead of sending an empty uuid", async () => {
    mockInsertOk();

    // Imported pending_review contacts have seller_id null; the individual
    // modal turns that into "" and the column is a uuid.
    await expect(P.create({ ...baseInput, fromSellerId: "" })).rejects.toThrow(
      /fromSellerId is required/,
    );
    expect(transfersInsert).not.toHaveBeenCalled();
  });

  it("rolls the transfer back when the reassignment fails, so no phantom transfer is left behind", async () => {
    mockInsertOk();
    customersUpdate.mockReturnValue({ data: null, error: { message: "permission denied" } });

    await expect(P.create(baseInput)).rejects.toThrow(/permission denied/);
    expect(transfersDelete).toHaveBeenCalledTimes(1);
  });

  it("chunks the reassignment so a large batch does not overflow the request URL", async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `c-${i}`);
    mockInsertOk(transferRow({ customer_ids: ids, type: "permanent_batch" }));
    customersUpdate.mockImplementation((call) => ({
      data: call.ids.map((id) => ({ id })),
      error: null,
    }));

    await P.create({ ...baseInput, type: "permanent_batch", customerIds: ids });

    expect(customersUpdate.mock.calls.length).toBeGreaterThan(1);
    const sent = customersUpdate.mock.calls.flatMap((c) => c[0].ids);
    expect(sent).toEqual(ids);
    for (const call of customersUpdate.mock.calls) {
      expect(call[0].ids.length).toBeLessThanOrEqual(100);
    }
  });
});

describe("supabaseTransfersProvider.revert / expire — undo the transfer", () => {
  it("revert sends the customers back to the origin seller", async () => {
    mockTransferUpdate({ data: transferRow({ status: "reverted" }), error: null });

    await P.revert("t-1");

    expect(customersUpdate).toHaveBeenCalledTimes(1);
    const call = customersUpdate.mock.calls[0]![0];
    expect(call.patch).toEqual({ seller_id: FROM_SELLER });
    expect(call.ids).toEqual(["c-1"]);
  });

  it("revert only touches customers still owned by the destination seller", async () => {
    mockTransferUpdate({ data: transferRow({ status: "reverted" }), error: null });

    await P.revert("t-1");

    // A customer transferred onward (B → C) must not be yanked back to A.
    expect(customersUpdate.mock.calls[0]![0].eqSellerId).toBe(TO_SELLER);
  });

  it("expire sends the customers back to the origin seller", async () => {
    mockTransferUpdate({ data: transferRow({ status: "expired" }), error: null });

    await P.expire("t-1");

    expect(customersUpdate).toHaveBeenCalledTimes(1);
    expect(customersUpdate.mock.calls[0]![0].patch).toEqual({ seller_id: FROM_SELLER });
  });

  it("restores the active status when the reassignment fails", async () => {
    mockTransferUpdate({ data: transferRow({ status: "reverted" }), error: null });
    customersUpdate.mockReturnValue({ data: null, error: { message: "boom" } });

    await expect(P.revert("t-1")).rejects.toThrow(/boom/);
    // First update flips to reverted, the compensating one flips back to active.
    expect(transfersUpdate).toHaveBeenCalledTimes(2);
    expect(transfersUpdate.mock.calls[1]![0]).toEqual({ status: "active" });
  });
});
