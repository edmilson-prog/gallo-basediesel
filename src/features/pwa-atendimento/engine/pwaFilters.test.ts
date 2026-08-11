import { describe, expect, it } from "vitest";
import {
  activeFilterCount,
  EMPTY_PWA_FILTERS,
  hasActiveSearch,
  PWA_OPEN_STATUSES,
  pwaFiltersToListParams,
  type IPwaFilters,
} from "./pwaFilters";

const CTX = { storeId: "store-1", currentSellerId: "seller-1" };

function filters(overrides: Partial<IPwaFilters> = {}): IPwaFilters {
  return { ...EMPTY_PWA_FILTERS, ...overrides };
}

describe("pwaFiltersToListParams — search", () => {
  it("drops every facet while searching, so a match is never hidden by a chip", () => {
    const params = pwaFiltersToListParams(
      filters({ q: "fronteira", status: "aguardando", channel: "phone", assign: "me" }),
      CTX,
    );
    expect(params).toEqual({
      storeId: "store-1",
      search: "fronteira",
      orderBy: "lastMessageAt",
      orderDir: "desc",
    });
  });

  it("trims the term before sending it", () => {
    expect(pwaFiltersToListParams(filters({ q: "  cargo  " }), CTX).search).toBe("cargo");
  });

  it("treats a whitespace-only box as no search at all", () => {
    const params = pwaFiltersToListParams(filters({ q: "   " }), CTX);
    expect(params.search).toBeUndefined();
    expect(params.status).toEqual(PWA_OPEN_STATUSES);
  });
});

describe("pwaFiltersToListParams — facets", () => {
  it("hides closed conversations by default", () => {
    expect(pwaFiltersToListParams(EMPTY_PWA_FILTERS, CTX).status).toEqual(PWA_OPEN_STATUSES);
  });

  it("sends a single status when one is picked", () => {
    expect(pwaFiltersToListParams(filters({ status: "resolvida" }), CTX).status).toBe("resolvida");
  });

  it("sends the channel only when narrowed", () => {
    expect(pwaFiltersToListParams(EMPTY_PWA_FILTERS, CTX).channel).toBeUndefined();
    expect(pwaFiltersToListParams(filters({ channel: "phone" }), CTX).channel).toBe("phone");
  });

  it("resolves 'me' to the current seller", () => {
    expect(pwaFiltersToListParams(filters({ assign: "me" }), CTX).assignmentAny).toEqual({
      sellerIds: ["seller-1"],
    });
  });

  it("asks for an empty seller set — never for everything — when there is no seller identity", () => {
    const params = pwaFiltersToListParams(filters({ assign: "me" }), {
      ...CTX,
      currentSellerId: null,
    });
    expect(params.assignmentAny).toEqual({ sellerIds: [] });
  });

  it("maps 'queue' to the pool token", () => {
    expect(pwaFiltersToListParams(filters({ assign: "queue" }), CTX).assignmentAny).toEqual({
      queue: true,
    });
  });

  it("applies no assignment constraint on 'all'", () => {
    expect(pwaFiltersToListParams(EMPTY_PWA_FILTERS, CTX).assignmentAny).toBeUndefined();
  });

  it("omits the store when none is selected", () => {
    expect(
      pwaFiltersToListParams(EMPTY_PWA_FILTERS, { ...CTX, storeId: null }).storeId,
    ).toBeUndefined();
  });
});

describe("activeFilterCount", () => {
  it("counts only the facets, never the search box", () => {
    expect(activeFilterCount(filters({ q: "fronteira" }))).toBe(0);
    expect(activeFilterCount(filters({ status: "aguardando" }))).toBe(1);
    expect(
      activeFilterCount(filters({ status: "aguardando", channel: "phone", assign: "me" })),
    ).toBe(3);
  });
});

describe("hasActiveSearch", () => {
  it("ignores whitespace", () => {
    expect(hasActiveSearch(filters({ q: "  " }))).toBe(false);
    expect(hasActiveSearch(filters({ q: " a " }))).toBe(true);
  });
});
