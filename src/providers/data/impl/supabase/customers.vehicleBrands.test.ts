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
  for (const method of ["eq", "in", "is", "not", "overlaps", "or", "order"]) {
    builder[method] = record(method);
  }
  builder.range = vi.fn(() => Promise.resolve({ data: [], error: null, count: 0 }));
  return { builder, calls };
}

let query = makeQuery();
/** Projection string handed to `.select()` on the list query. */
let projection = "";
const select = vi.fn((columns: string) => {
  projection = columns;
  return query.builder;
});
const from = vi.fn(() => ({ select }));
vi.mock("@/shared/lib/supabase", () => ({
  getSupabaseClient: () => ({ from }),
}));

import { supabaseCustomersProvider as P } from "./customers";

beforeEach(() => {
  query = makeQuery();
  projection = "";
  select.mockClear();
  from.mockClear();
});

/** The `.in()` call carrying the embedded brand predicate, if any. */
function brandFilter() {
  return query.calls.find((c) => c.method === "in" && c.args[0] === "vehicles.brand");
}

describe("supabaseCustomersProvider.list — vehicleBrands", () => {
  it("inner-joins the embedded vehicles and filters brand IN (…) when brands are given", async () => {
    await P.list({ vehicleBrands: ["Volvo", "Scania"] });

    expect(projection).toContain("vehicles!inner(");
    expect(brandFilter()?.args[1]).toEqual(["Volvo", "Scania"]);
  });

  it('keeps the inner join but drops the brand predicate for the "any" sentinel', async () => {
    await P.list({ vehicleBrands: ["any"] });

    expect(projection).toContain("vehicles!inner(");
    expect(brandFilter()).toBeUndefined();
  });

  it('lets "any" win over co-selected brands — owns a vehicle, not only those brands', async () => {
    await P.list({ vehicleBrands: ["any", "Volvo"] });

    expect(projection).toContain("vehicles!inner(");
    expect(brandFilter()).toBeUndefined();
  });

  it("adds no join when the filter is absent, so customers without vehicles still list", async () => {
    await P.list({});

    expect(projection).not.toContain("vehicles");
    expect(brandFilter()).toBeUndefined();
  });

  it("adds no join for an empty brand array", async () => {
    await P.list({ vehicleBrands: [] });

    expect(projection).not.toContain("vehicles");
  });

  it("resolves the filter server-side — never by materializing a customer-id list", async () => {
    await P.list({ vehicleBrands: ["Volvo"] });

    // One query, one table: no pre-flight round trip to `vehicles` to collect
    // ids (that path caps at 1000 rows and overflows the URL on the `.in()`).
    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith("customers");
    expect(query.calls.some((c) => c.method === "in" && c.args[0] === "id")).toBe(false);
  });

  it("combines with the store scope instead of replacing it", async () => {
    await P.list({ vehicleBrands: ["Volvo"], storeIds: ["store-1"] });

    const storeCall = query.calls.find((c) => c.method === "in" && c.args[0] === "store_id");
    expect(storeCall?.args[1]).toEqual(["store-1"]);
    expect(brandFilter()?.args[1]).toEqual(["Volvo"]);
  });
});
