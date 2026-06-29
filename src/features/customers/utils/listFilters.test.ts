import { describe, expect, it } from "vitest";
import {
  DEFAULT_SORT,
  EMPTY_FILTERS,
  HIDDEN_CUSTOMER_TAGS,
  toListParams,
} from "./listFilters";

describe("HIDDEN_CUSTOMER_TAGS", () => {
  it("hides both pending_review and reviewed_not_customer", () => {
    expect(HIDDEN_CUSTOMER_TAGS).toContain("pending_review");
    expect(HIDDEN_CUSTOMER_TAGS).toContain("reviewed_not_customer");
  });

  it("toListParams always excludes the hidden tags", () => {
    const params = toListParams(EMPTY_FILTERS, DEFAULT_SORT, 1, 50);
    expect(params.excludeTags).toEqual([...HIDDEN_CUSTOMER_TAGS]);
  });
});

describe("toListParams — hidden review tags", () => {
  it("always excludes the pending_review contacts from the customers list", () => {
    // Imported WhatsApp contacts land as `pending_review` customers (the anchor
    // for their conversation). They must NOT surface in the Clientes screen until
    // a manual conversion promotes them — only their conversation shows in the Inbox.
    const params = toListParams(EMPTY_FILTERS, DEFAULT_SORT, 1, 50);
    expect(params.excludeTags).toEqual([...HIDDEN_CUSTOMER_TAGS]);
  });

  it("keeps the exclusion regardless of the active filters", () => {
    const params = toListParams(
      { ...EMPTY_FILTERS, type: "B2C", statuses: ["ativo"], search: "joao" },
      DEFAULT_SORT,
      2,
      200,
    );
    expect(params.excludeTags).toEqual([...HIDDEN_CUSTOMER_TAGS]);
  });
});
