import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the chainable query builder for `from(TABLE).select(COLUMNS).eq("id", id).maybeSingle()`.
const maybeSingle = vi.fn();
const eq = vi.fn(() => ({ maybeSingle }));
const select = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ select }));
vi.mock("@/shared/lib/supabase", () => ({
  getSupabaseClient: () => ({ from }),
}));

import { supabaseConversationsProvider as P } from "./conversations";

beforeEach(() => {
  maybeSingle.mockReset();
  from.mockClear();
  select.mockClear();
  eq.mockClear();
});

describe("supabaseConversationsProvider.get", () => {
  it("raises a soft not-found (no 406) when the row is absent/forbidden by RLS", async () => {
    // A collaborator who just left the conversation loses RLS read access, so
    // the refetch returns 0 rows. `.maybeSingle()` yields {data:null,error:null}
    // (no 406); get() must translate that into a /not found/i error so
    // useConversationDetail maps it to the graceful notFound empty state instead
    // of the retryable error banner.
    maybeSingle.mockResolvedValue({ data: null, error: null });

    await expect(P.get("conv-1")).rejects.toThrow(/not found/i);
    expect(from).toHaveBeenCalledWith("conversations");
    expect(maybeSingle).toHaveBeenCalledTimes(1);
  });

  it("propagates a genuine query error", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: "boom" } });

    await expect(P.get("conv-1")).rejects.toThrow(/conversations\.get\(conv-1\) failed: boom/);
  });
});
