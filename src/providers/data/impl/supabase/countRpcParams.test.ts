import { describe, expect, it } from "vitest";
import { buildCountRpcParams } from "./countRpcParams";

describe("buildCountRpcParams", () => {
  it("maps the empty param set to all-null/false RPC args (Todas)", () => {
    expect(buildCountRpcParams({})).toEqual({
      p_status: null,
      p_channel: null,
      p_whatsapp_account_id: null,
      p_is_sdr_active: null,
      p_tags: null,
      p_from_date: null,
      p_to_date: null,
      p_assigned_seller_ids: null,
      p_unassigned: false,
      p_include_queue: false,
    });
  });

  it("normalizes a scalar status to a single-element array", () => {
    expect(buildCountRpcParams({ status: "aguardando" }).p_status).toEqual(["aguardando"]);
  });

  it("passes a status array through unchanged", () => {
    expect(
      buildCountRpcParams({
        status: ["aguardando", "em_andamento", "aguardando_cliente", "resolvida"],
      }).p_status,
    ).toEqual(["aguardando", "em_andamento", "aguardando_cliente", "resolvida"]);
  });

  it("maps the Inbox incident filter shape (me + queue)", () => {
    // The "Sem atribuição" filter was unified into "Em fila" (queue) on
    // 2026-07-02 — assignmentAny no longer carries an `unassigned` flag and the
    // count always sends p_unassigned=false (the queue count rides
    // p_include_queue).
    const params = buildCountRpcParams({
      status: ["aguardando", "em_andamento", "aguardando_cliente", "resolvida"],
      assignmentAny: {
        sellerIds: ["97834e8d-e1b5-4bb7-9f25-2e58e641fdab"],
        queue: true,
      },
    });
    expect(params.p_assigned_seller_ids).toEqual(["97834e8d-e1b5-4bb7-9f25-2e58e641fdab"]);
    expect(params.p_unassigned).toBe(false);
    expect(params.p_include_queue).toBe(true);
  });

  it("drops malformed seller ids (same sanitization as the .or() filter)", () => {
    const params = buildCountRpcParams({
      assignmentAny: { sellerIds: ["not-a-uuid", "97834e8d-e1b5-4bb7-9f25-2e58e641fdab"] },
    });
    expect(params.p_assigned_seller_ids).toEqual(["97834e8d-e1b5-4bb7-9f25-2e58e641fdab"]);
  });

  it("maps channel/instance/sdr/tags/period filters", () => {
    expect(
      buildCountRpcParams({
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
      p_unassigned: false,
      p_include_queue: false,
    });
  });

  it("rejects params the RPC does not mirror (fail-fast, not silent drift)", () => {
    expect(() => buildCountRpcParams({ search: "volvo" })).toThrow(/no-search/);
    expect(() => buildCountRpcParams({ customerId: "c1" })).toThrow(/no-search/);
    expect(() => buildCountRpcParams({ leadId: "l1" })).toThrow(/no-search/);
    expect(() => buildCountRpcParams({ assignedSellerId: "s1" })).toThrow(/no-search/);
    expect(() => buildCountRpcParams({ unassigned: true })).toThrow(/no-search/);
    expect(() => buildCountRpcParams({ storeId: "00000000-0000-0000-0000-000000000001" })).toThrow(
      /no-search/,
    );
  });

  it("treats whitespace-only search as no-search (parity with list()'s trim routing)", () => {
    // list() routes only `search.trim().length > 0` to the search RPC; a
    // whitespace term stays on the plain path (total -1) → count() is called
    // with search="  ". It must NOT throw, and must count as if unfiltered.
    expect(() => buildCountRpcParams({ search: "   " })).not.toThrow();
    expect(buildCountRpcParams({ search: "   " }).p_status).toBeNull();
  });
});
