import { describe, it, expect, vi, beforeEach } from "vitest";

// `.insert()` must be terminal here — no chained `.select()`. If the implementation
// regresses to `.insert(row).select(COLUMNS).single()`, this mock has no `.select`
// method to hand back, so the call throws instead of silently passing.
const insert = vi.fn();
const from = vi.fn(() => ({ insert }));
vi.mock("@/shared/lib/supabase", () => ({
  getSupabaseClient: () => ({ from }),
}));

import { supabaseConversationsProvider as P } from "./conversations";

beforeEach(() => {
  insert.mockReset();
  from.mockClear();
});

describe("supabaseConversationsProvider.createOutbound", () => {
  it("inserts without reading the row back (RETURNING can't see a row created by this same INSERT under RLS)", async () => {
    insert.mockResolvedValue({ error: null });

    const conversation = await P.createOutbound({
      storeId: "store-1",
      whatsappAccountId: "wa-1",
      assignedSellerId: "seller-1",
      customerId: "cust-1",
    });

    expect(from).toHaveBeenCalledWith("conversations");
    expect(insert).toHaveBeenCalledTimes(1);
    expect(conversation.storeId).toBe("store-1");
    expect(conversation.whatsappAccountId).toBe("wa-1");
    expect(conversation.assignedSellerId).toBe("seller-1");
    expect(conversation.customerId).toBe("cust-1");
    expect(conversation.status).toBe("em_andamento");
    expect(conversation.isSdrActive).toBe(false);
    expect(typeof conversation.id).toBe("string");
    expect(conversation.id.length).toBeGreaterThan(0);
  });

  it("propagates a genuine insert error", async () => {
    insert.mockResolvedValue({ error: { message: "boom" } });

    await expect(
      P.createOutbound({
        storeId: "store-1",
        whatsappAccountId: "wa-1",
        assignedSellerId: "seller-1",
        customerId: "cust-1",
      }),
    ).rejects.toThrow(/conversations\.createOutbound failed: boom/);
  });
});
