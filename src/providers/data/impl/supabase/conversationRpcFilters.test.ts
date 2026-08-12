import { describe, expect, it } from "vitest";
import { buildSharedConversationRpcFilters } from "./conversationRpcFilters";

describe("buildSharedConversationRpcFilters", () => {
  it("maps the empty param set to all-null/false shared fields", () => {
    expect(buildSharedConversationRpcFilters({})).toEqual({
      p_status: null,
      p_channel: null,
      p_whatsapp_account_id: null,
      p_is_sdr_active: null,
      p_tags: null,
      p_from_date: null,
      p_to_date: null,
      p_assigned_seller_ids: null,
      p_include_queue: false,
    });
  });

  it("normalizes a scalar status to a single-element array", () => {
    expect(buildSharedConversationRpcFilters({ status: "aguardando" }).p_status).toEqual([
      "aguardando",
    ]);
  });

  it("sanitizes seller ids and folds the queue flag", () => {
    const out = buildSharedConversationRpcFilters({
      assignmentAny: {
        sellerIds: ["not-a-uuid", "97834e8d-e1b5-4bb7-9f25-2e58e641fdab"],
        queue: true,
      },
    });
    expect(out.p_assigned_seller_ids).toEqual(["97834e8d-e1b5-4bb7-9f25-2e58e641fdab"]);
    expect(out.p_include_queue).toBe(true);
  });

  it("does NOT emit p_unassigned (each builder owns its own derivation)", () => {
    expect(buildSharedConversationRpcFilters({ assignmentAny: { queue: true } })).not.toHaveProperty(
      "p_unassigned",
    );
  });

  it("maps channel/instance/sdr/tags/period consistently", () => {
    expect(
      buildSharedConversationRpcFilters({
        channel: "whatsapp",
        whatsappAccountId: "0f0e0d0c-0b0a-0908-0706-050403020100",
        isSdrActive: false,
        tags: ["vip"],
        fromDate: "2026-07-01T00:00:00.000Z",
        toDate: "2026-07-02T00:00:00.000Z",
      }),
    ).toEqual({
      p_status: null,
      p_channel: "whatsapp",
      p_whatsapp_account_id: "0f0e0d0c-0b0a-0908-0706-050403020100",
      p_is_sdr_active: false,
      p_tags: ["vip"],
      p_from_date: "2026-07-01T00:00:00.000Z",
      p_to_date: "2026-07-02T00:00:00.000Z",
      p_assigned_seller_ids: null,
      p_include_queue: false,
    });
  });
});
