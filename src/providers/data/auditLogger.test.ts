import { describe, it, expect, vi, beforeEach } from "vitest";

const create = vi.fn();
vi.mock("./factory", () => ({
  getDataProviders: () => ({ audits: { create } }),
}));

import { recordAuditLog, recordAuditLogSync } from "./auditLogger";

const BASE = {
  actorId: "5a6400ed-5aec-4bf1-b641-31635f15c887",
  action: "customer_update",
  resource: "customer",
  resourceId: "c-1",
};

const FALLBACK_STORE_ID = "00000000-0000-0000-0000-000000000001";

beforeEach(() => {
  create.mockReset();
  create.mockResolvedValue({});
});

describe("recordAuditLogSync", () => {
  it("applies the fallback store when storeId is absent", () => {
    recordAuditLogSync(BASE);

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ storeId: FALLBACK_STORE_ID }));
  });

  it("applies the fallback store even when storeId is explicitly undefined", () => {
    // Callers that spread optional params can pass `storeId: undefined` as an
    // own property — it must not shadow the fallback.
    recordAuditLogSync({ ...BASE, storeId: undefined });

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ storeId: FALLBACK_STORE_ID }));
  });

  it("keeps a provided storeId", () => {
    recordAuditLogSync({ ...BASE, storeId: "store-explicit" });

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ storeId: "store-explicit" }));
  });
});

describe("recordAuditLog", () => {
  it("swallows provider failures so auditing never breaks the action", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      create.mockRejectedValue(new Error("boom"));

      await expect(recordAuditLog({ ...BASE, storeId: "s1" })).resolves.toBeUndefined();
    } finally {
      warn.mockRestore();
    }
  });
});
