import { describe, it, expect, vi, beforeEach } from "vitest";

/** Chainable stub mimicking the postgrest builder surface `list()` uses. */
function makeQuery() {
  const calls: { method: string; args: unknown[] }[] = [];
  const builder: Record<string, unknown> = {};
  const record =
    (method: string) =>
    (...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    };
  for (const method of ["eq", "in", "gte", "lte", "order"]) {
    builder[method] = record(method);
  }
  builder.range = vi.fn(() => Promise.resolve({ data: [], error: null, count: 0 }));
  return { builder, calls };
}

let query = makeQuery();
const select = vi.fn(() => query.builder);
const from = vi.fn(() => ({ select }));
vi.mock("@/shared/lib/supabase", () => ({
  getSupabaseClient: () => ({ from }),
}));

import { supabaseAuditsProvider as P } from "./audits";

beforeEach(() => {
  query = makeQuery();
  select.mockReturnValue(query.builder);
  from.mockClear();
});

describe("supabaseAuditsProvider.list — resourceIds", () => {
  it("filters by resource_id IN (…) when resourceIds is given", async () => {
    await P.list({ resourceIds: ["t-1", "t-2", "t-3"] });

    const inCall = query.calls.find((c) => c.method === "in" && c.args[0] === "resource_id");
    expect(inCall?.args[1]).toEqual(["t-1", "t-2", "t-3"]);
  });

  it("falls back to resource_id = … when only the singular resourceId is given", async () => {
    await P.list({ resourceId: "t-1" });

    const eqCall = query.calls.find((c) => c.method === "eq" && c.args[0] === "resource_id");
    expect(eqCall?.args[1]).toBe("t-1");
    expect(query.calls.some((c) => c.method === "in" && c.args[0] === "resource_id")).toBe(false);
  });

  it("prefers resourceIds over resourceId when both are given, matching the actorId/actorIds and resource/resources pattern", async () => {
    await P.list({ resourceIds: ["t-1"], resourceId: "t-2" });

    expect(query.calls.some((c) => c.method === "eq" && c.args[0] === "resource_id")).toBe(false);
    const inCall = query.calls.find((c) => c.method === "in" && c.args[0] === "resource_id");
    expect(inCall?.args[1]).toEqual(["t-1"]);
  });

  it("skips the resource_id filter entirely when neither is given", async () => {
    await P.list({});

    expect(query.calls.some((c) => c.args[0] === "resource_id")).toBe(false);
  });
});
