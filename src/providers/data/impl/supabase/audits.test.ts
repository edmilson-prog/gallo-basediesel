import { describe, it, expect, vi, beforeEach } from "vitest";

const insert = vi.fn();
const from = vi.fn(() => ({ insert }));
const getSession = vi.fn();
vi.mock("@/shared/lib/supabase", () => ({
  getSupabaseClient: () => ({ from, auth: { getSession } }),
}));

import { supabaseAuditsProvider as P } from "./audits";

/** Builds a syntactically valid JWT whose payload carries the given app_metadata. */
function fakeJwt(appMetadata: Record<string, unknown>): string {
  const payload = btoa(JSON.stringify({ app_metadata: appMetadata }))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `header.${payload}.signature`;
}

const INPUT = {
  actorId: "5a6400ed-5aec-4bf1-b641-31635f15c887",
  action: "customer_update",
  resource: "customer",
  resourceId: "c-1",
  storeId: "store-input",
  before: { name: "a" },
  after: { name: "b" },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

beforeEach(() => {
  insert.mockReset();
  from.mockClear();
  getSession.mockReset();
  insert.mockResolvedValue({ error: null });
});

describe("supabaseAuditsProvider.create", () => {
  it("inserts without requesting representation (no RETURNING) and synthesizes the returned log", async () => {
    // audit_logs SELECT is staff/financeiro-only; INSERT ... RETURNING must pass
    // it, so a representation request 403s for sellers. The insert must resolve
    // on its own (return=minimal).
    getSession.mockResolvedValue({ data: { session: { access_token: fakeJwt({ store_id: "store-jwt" }) } } });

    const out = await P.create(INPUT);

    expect(from).toHaveBeenCalledWith("audit_logs");
    expect(insert).toHaveBeenCalledTimes(1);
    const payload = insert.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.id).toMatch(UUID_RE);
    expect(payload.actor_id).toBe(INPUT.actorId);
    expect(payload.action).toBe(INPUT.action);
    expect(payload.resource).toBe(INPUT.resource);
    expect(payload.resource_id).toBe(INPUT.resourceId);
    expect(payload.before).toEqual(INPUT.before);
    expect(payload.after).toEqual(INPUT.after);
    expect(typeof payload.timestamp).toBe("string");

    expect(out).toEqual({
      id: payload.id,
      actorId: INPUT.actorId,
      action: INPUT.action,
      resource: INPUT.resource,
      resourceId: INPUT.resourceId,
      before: INPUT.before,
      after: INPUT.after,
      timestamp: payload.timestamp,
      storeId: "store-jwt",
    });
  });

  it("scopes store_id to the JWT claim — the only value the RLS WITH CHECK accepts", async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: fakeJwt({ store_id: "store-jwt" }) } } });

    await P.create(INPUT);

    const payload = insert.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.store_id).toBe("store-jwt");
  });

  it("falls back to the caller store when there is no session", async () => {
    getSession.mockResolvedValue({ data: { session: null } });

    const out = await P.create(INPUT);

    const payload = insert.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.store_id).toBe("store-input");
    expect(out.storeId).toBe("store-input");
  });

  it("falls back to the caller store when the token is malformed or lacks the claim", async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: "not-a-jwt" } } });
    await P.create(INPUT);
    expect((insert.mock.calls[0]![0] as Record<string, unknown>).store_id).toBe("store-input");

    getSession.mockResolvedValue({ data: { session: { access_token: fakeJwt({}) } } });
    await P.create(INPUT);
    expect((insert.mock.calls[1]![0] as Record<string, unknown>).store_id).toBe("store-input");
  });

  it("still records even if reading the session itself blows up", async () => {
    getSession.mockRejectedValue(new Error("auth unavailable"));

    const out = await P.create(INPUT);

    expect((insert.mock.calls[0]![0] as Record<string, unknown>).store_id).toBe("store-input");
    expect(out.storeId).toBe("store-input");
  });

  it("rescues a placeholder actor from the JWT seller claim", async () => {
    // actor_id is a NOT NULL uuid FK to sellers — "system" (pre-hydration
    // fallback) would die server-side as 22P02. The seller claim is the actor.
    const sellerFromJwt = "9b2f1c04-88d1-4f2e-9a37-6f0d1c2b3a45";
    getSession.mockResolvedValue({
      data: { session: { access_token: fakeJwt({ store_id: "store-jwt", seller_id: sellerFromJwt }) } },
    });

    const out = await P.create({ ...INPUT, actorId: "system" });

    expect((insert.mock.calls[0]![0] as Record<string, unknown>).actor_id).toBe(sellerFromJwt);
    expect(out.actorId).toBe(sellerFromJwt);
  });

  it("keeps a valid caller actor even when the JWT carries a different seller", async () => {
    getSession.mockResolvedValue({
      data: {
        session: {
          access_token: fakeJwt({ store_id: "store-jwt", seller_id: "9b2f1c04-88d1-4f2e-9a37-6f0d1c2b3a45" }),
        },
      },
    });

    await P.create(INPUT);

    expect((insert.mock.calls[0]![0] as Record<string, unknown>).actor_id).toBe(INPUT.actorId);
  });

  it("fails fast without hitting the network when the actor is unrecoverable", async () => {
    // Non-UUID actor and no seller claim: the insert is doomed (22P02/23503),
    // so create must throw a descriptive error before issuing the request.
    getSession.mockResolvedValue({ data: { session: null } });

    await expect(P.create({ ...INPUT, actorId: "system" })).rejects.toThrow(/actor/i);
    expect(insert).not.toHaveBeenCalled();
  });

  it("gives up on a hung session read after the timeout and still records", async () => {
    // getSession can block on the supabase-js auth lock; a fire-and-forget
    // audit must degrade to the caller fallback instead of hanging forever.
    vi.useFakeTimers();
    try {
      getSession.mockReturnValue(new Promise(() => {}));

      const pending = P.create(INPUT);
      await vi.advanceTimersByTimeAsync(5_000);
      const out = await pending;

      expect((insert.mock.calls[0]![0] as Record<string, unknown>).store_id).toBe("store-input");
      expect(out.storeId).toBe("store-input");
    } finally {
      vi.useRealTimers();
    }
  });

  it("throws when the insert fails", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    insert.mockResolvedValue({ error: { message: "boom" } });

    await expect(P.create(INPUT)).rejects.toThrow(/audits\.create failed: boom/);
  });
});
