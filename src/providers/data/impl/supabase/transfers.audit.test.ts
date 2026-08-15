import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * `carteira_transfers` history/audit UI reads audit_logs (`transfer.create` /
 * `.revert` / `.expire`) for who acted and when. The mock backend has always
 * written those via `logMockMutation`; this provider never did — so every
 * transfer created/reverted/expired in supabase left zero trace, and the
 * Auditoria tab was permanently empty regardless of how much activity there
 * was (verified against prod: 10 real transfers, 0 audit_logs rows).
 */

const recordAuditLog = vi.fn().mockResolvedValue(undefined);
vi.mock("../../auditLogger", () => ({
  recordAuditLog: (...args: unknown[]) => recordAuditLog(...args),
}));

type QueryResult = { data?: unknown; error?: unknown };

const transfersInsert = vi.fn();
const transfersUpdate = vi.fn();
const transfersDelete = vi.fn();
const customersUpdate = vi.fn<() => QueryResult>();

function makeFrom() {
  return vi.fn((table: string) => {
    if (table === "customers") {
      return {
        update: () => ({
          in: () => ({
            eq: () => ({ select: () => Promise.resolve(customersUpdate()) }),
            select: () => Promise.resolve(customersUpdate()),
          }),
        }),
      };
    }
    return { insert: transfersInsert, update: transfersUpdate, delete: transfersDelete };
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

function mockInsertOk(row = transferRow()) {
  transfersInsert.mockReturnValue({
    select: () => ({ single: () => Promise.resolve({ data: row, error: null }) }),
  });
}

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
  transfersDelete.mockImplementation(() => ({ eq: () => Promise.resolve({ error: null }) }));
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
  recordAuditLog.mockClear();
});

describe("supabaseTransfersProvider.create — records an audit_logs entry", () => {
  it("records transfer.create with the creator as actor", async () => {
    mockInsertOk();

    await P.create(baseInput);

    expect(recordAuditLog).toHaveBeenCalledTimes(1);
    const entry = recordAuditLog.mock.calls[0]![0];
    // The insert generates its own id (crypto.randomUUID()) — assert the audit
    // entry points at that same id, whatever it is, not a fixture literal.
    const insertedId = (transfersInsert.mock.calls[0]![0] as Record<string, unknown>).id;
    expect(entry).toMatchObject({
      actorId: ACTOR,
      action: "transfer.create",
      resource: "transfer",
      resourceId: insertedId,
      storeId: STORE,
    });
  });

  it("does not record an audit entry when the create itself fails", async () => {
    mockInsertOk();
    customersUpdate.mockReturnValue({ data: null, error: { message: "permission denied" } });

    await expect(P.create(baseInput)).rejects.toThrow();
    expect(recordAuditLog).not.toHaveBeenCalled();
  });
});

describe("supabaseTransfersProvider.revert/expire — record an audit_logs entry", () => {
  it("revert records transfer.revert with the given actor", async () => {
    mockTransferUpdate({ data: transferRow({ status: "reverted" }), error: null });

    await P.revert("t-1", ACTOR);

    expect(recordAuditLog).toHaveBeenCalledTimes(1);
    expect(recordAuditLog.mock.calls[0]![0]).toMatchObject({
      actorId: ACTOR,
      action: "transfer.revert",
      resource: "transfer",
      resourceId: "t-1",
      storeId: STORE,
    });
  });

  it("expire records transfer.expire with the given actor", async () => {
    mockTransferUpdate({ data: transferRow({ status: "expired" }), error: null });

    await P.expire("t-1", ACTOR);

    expect(recordAuditLog.mock.calls[0]![0]).toMatchObject({
      actorId: ACTOR,
      action: "transfer.expire",
      resource: "transfer",
      resourceId: "t-1",
    });
  });

  it("skips the audit entry when no actor is available, without failing the mutation", async () => {
    // e.g. the auto-revert timer ticking with no signed-in seller resolvable.
    // audit_logs.actor_id is a NOT NULL FK to sellers — there is no honest
    // "system" value to write, so this stays silent rather than fabricate one.
    mockTransferUpdate({ data: transferRow({ status: "expired" }), error: null });

    const result = await P.expire("t-1");

    expect(result.status).toBe("expired");
    expect(recordAuditLog).not.toHaveBeenCalled();
  });

  it("does not record an audit entry when the reassignment fails and the revert is rolled back", async () => {
    mockTransferUpdate({ data: transferRow({ status: "reverted" }), error: null });
    customersUpdate.mockReturnValue({ data: null, error: { message: "boom" } });

    await expect(P.revert("t-1", ACTOR)).rejects.toThrow();
    expect(recordAuditLog).not.toHaveBeenCalled();
  });
});
