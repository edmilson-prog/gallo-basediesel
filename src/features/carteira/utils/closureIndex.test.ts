import { describe, it, expect } from "vitest";
import type { IAuditLog } from "@/shared/types";
import { buildClosureIndex } from "./closureIndex";

function entry(overrides: Partial<IAuditLog> = {}): IAuditLog {
  return {
    id: "audit-1",
    actorId: "seller-1",
    action: "transfer.revert",
    resource: "transfer",
    resourceId: "t-1",
    timestamp: "2026-06-06T13:40:38.469Z",
    storeId: "store-1",
    ...overrides,
  };
}

describe("buildClosureIndex", () => {
  it("maps a transfer id to its closing actor and timestamp", () => {
    const index = buildClosureIndex([entry()]);

    expect(index.get("t-1")).toEqual({
      actorId: "seller-1",
      timestamp: "2026-06-06T13:40:38.469Z",
    });
  });

  it("keeps only the FIRST entry seen per transfer id — callers must pass entries newest-first", () => {
    const index = buildClosureIndex([
      entry({ id: "audit-2", actorId: "seller-2", timestamp: "2026-06-07T00:00:00.000Z" }),
      entry({ id: "audit-1", actorId: "seller-1", timestamp: "2026-06-06T13:40:38.469Z" }),
    ]);

    expect(index.get("t-1")).toEqual({
      actorId: "seller-2",
      timestamp: "2026-06-07T00:00:00.000Z",
    });
    expect(index.size).toBe(1);
  });

  it("keys entries for different transfers independently", () => {
    const index = buildClosureIndex([
      entry({ resourceId: "t-1" }),
      entry({ id: "audit-2", resourceId: "t-2", actorId: "seller-2" }),
    ]);

    expect(index.size).toBe(2);
    expect(index.get("t-2")?.actorId).toBe("seller-2");
  });

  it("returns an empty map for an empty input", () => {
    expect(buildClosureIndex([]).size).toBe(0);
  });
});
