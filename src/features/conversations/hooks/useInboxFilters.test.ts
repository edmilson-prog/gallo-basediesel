import { describe, it, expect } from "vitest";
import {
  parseAssignmentTokens,
  serializeAssignmentTokens,
  filtersToListParams,
  type IInboxFiltersState,
} from "./useInboxFilters";

const SELLER = "seller-1";

function baseState(over: Partial<IInboxFiltersState> = {}): IInboxFiltersState {
  return {
    status: "all",
    channel: "all",
    assignment: ["me"],
    instance: "all",
    tags: [],
    period: "all",
    search: "",
    sort: "lastMessage",
    escalated: false,
    ...over,
  };
}

describe("parseAssignmentTokens", () => {
  it("defaults to ['me'] for a seller and [] without one", () => {
    expect(parseAssignmentTokens(undefined, SELLER)).toEqual(["me"]);
    expect(parseAssignmentTokens(undefined, null)).toEqual([]);
  });
  it("maps the `all` sentinel to the empty set", () => {
    expect(parseAssignmentTokens("all", SELLER)).toEqual([]);
  });
  it("splits CSV, trims, de-dups, preserves order", () => {
    expect(parseAssignmentTokens("me, unassigned ,me,queue", SELLER)).toEqual([
      "me",
      "unassigned",
      "queue",
    ]);
  });
  it("accepts a legacy single value", () => {
    expect(parseAssignmentTokens("queue", SELLER)).toEqual(["queue"]);
  });
});

describe("serializeAssignmentTokens", () => {
  it("omits the default (undefined → clean URL)", () => {
    expect(serializeAssignmentTokens(["me"], SELLER)).toBeUndefined();
    expect(serializeAssignmentTokens([], null)).toBeUndefined();
  });
  it("serializes the empty set to the `all` sentinel for a seller", () => {
    expect(serializeAssignmentTokens([], SELLER)).toBe("all");
  });
  it("joins multiple tokens as CSV", () => {
    expect(serializeAssignmentTokens(["me", "unassigned"], SELLER)).toBe("me,unassigned");
  });
});

describe("filtersToListParams — assignment", () => {
  it("resolves ['me'] to assignmentAny.sellerIds=[currentSellerId]", () => {
    const p = filtersToListParams(baseState({ assignment: ["me"] }), { currentSellerId: SELLER });
    expect(p.assignmentAny).toEqual({ sellerIds: [SELLER] });
  });
  it("ORs me + unassigned + a specific seller", () => {
    const p = filtersToListParams(baseState({ assignment: ["me", "unassigned", "seller-9"] }), {
      currentSellerId: SELLER,
    });
    expect(p.assignmentAny).toEqual({ sellerIds: [SELLER, "seller-9"], unassigned: true });
  });
  it("queue does NOT force the global status filter", () => {
    const p = filtersToListParams(baseState({ assignment: ["queue"] }), { currentSellerId: SELLER });
    expect(p.assignmentAny).toEqual({ queue: true });
    // status stays the default 'all' expansion, not pinned to 'aguardando'
    expect(p.status).toEqual(["aguardando", "em_andamento", "aguardando_cliente", "resolvida"]);
  });
  it("empty set (Todas) applies no assignment constraint", () => {
    const p = filtersToListParams(baseState({ assignment: [] }), { currentSellerId: SELLER });
    expect(p.assignmentAny).toBeUndefined();
  });
});

describe("filtersToListParams — tags", () => {
  it("omits tags when none are selected", () => {
    const params = filtersToListParams(baseState({ tags: [] }), { currentSellerId: null });
    expect(params.tags).toBeUndefined();
  });

  it("passes selected tag ids straight through (OR semantics downstream)", () => {
    const params = filtersToListParams(baseState({ tags: ["ctag-a", "ctag-b"] }), {
      currentSellerId: null,
    });
    expect(params.tags).toEqual(["ctag-a", "ctag-b"]);
  });
});
