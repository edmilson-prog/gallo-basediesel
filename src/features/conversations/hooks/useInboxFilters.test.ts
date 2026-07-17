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
    expect(parseAssignmentTokens("me, queue ,me,seller-9", SELLER)).toEqual([
      "me",
      "queue",
      "seller-9",
    ]);
  });
  it("accepts a legacy single value", () => {
    expect(parseAssignmentTokens("queue", SELLER)).toEqual(["queue"]);
  });
  it("normalizes the legacy 'unassigned' token (pre-unification URLs/localStorage) to 'queue'", () => {
    expect(parseAssignmentTokens("unassigned", SELLER)).toEqual(["queue"]);
    expect(parseAssignmentTokens("me,unassigned,queue", SELLER)).toEqual(["me", "queue"]);
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
    expect(serializeAssignmentTokens(["me", "queue"], SELLER)).toBe("me,queue");
  });
});

describe("filtersToListParams — assignment", () => {
  it("resolves ['me'] to assignmentAny.sellerIds=[currentSellerId]", () => {
    const p = filtersToListParams(baseState({ assignment: ["me"] }), { currentSellerId: SELLER });
    expect(p.assignmentAny).toEqual({ sellerIds: [SELLER] });
  });
  it("ORs me + queue + a specific seller", () => {
    const p = filtersToListParams(baseState({ assignment: ["me", "queue", "seller-9"] }), {
      currentSellerId: SELLER,
    });
    expect(p.assignmentAny).toEqual({ sellerIds: [SELLER, "seller-9"], queue: true });
  });
  it("queue does NOT force the global status filter", () => {
    const p = filtersToListParams(baseState({ assignment: ["queue"] }), { currentSellerId: SELLER });
    expect(p.assignmentAny).toEqual({ queue: true });
    // status stays the default 'all' expansion, not pinned to 'aguardando'
    expect(p.status).toEqual(["aguardando", "em_andamento", "aguardando_cliente"]);
  });
  it("empty set (Todas) applies no assignment constraint", () => {
    const p = filtersToListParams(baseState({ assignment: [] }), { currentSellerId: SELLER });
    expect(p.assignmentAny).toBeUndefined();
  });
});

describe("filtersToListParams — status default", () => {
  it("'all' excludes closed conversations (resolvida + arquivada)", () => {
    const p = filtersToListParams(baseState({ status: "all" }), { currentSellerId: null });
    expect(p.status).toEqual(["aguardando", "em_andamento", "aguardando_cliente"]);
  });
  it("an explicit status (e.g. 'resolvida') passes through unchanged", () => {
    const p = filtersToListParams(baseState({ status: "resolvida" }), { currentSellerId: null });
    expect(p.status).toBe("resolvida");
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

describe("filtersToListParams — search mode ignores filters", () => {
  it("with a term, returns only search + default ordering (global search)", () => {
    const p = filtersToListParams(
      baseState({
        search: "98888-4188",
        status: "em_andamento",
        channel: "whatsapp",
        instance: "acc-1",
        tags: ["tag-1"],
        period: "7d",
        assignment: ["me", "queue"],
        sort: "waiting",
        escalated: true,
      }),
      { currentSellerId: SELLER },
    );
    expect(p).toEqual({ search: "98888-4188", orderBy: "lastMessageAt", orderDir: "desc" });
  });
  it("without a term, keeps the filtered behavior unchanged", () => {
    const p = filtersToListParams(baseState({ status: "em_andamento" }), {
      currentSellerId: SELLER,
    });
    expect(p.search).toBeUndefined();
    expect(p.status).toBe("em_andamento");
    expect(p.assignmentAny).toEqual({ sellerIds: [SELLER] });
  });
});
