import { describe, expect, it } from "vitest";
import type { IConversation } from "@/shared/types";
import {
  activeFilterCount,
  EMPTY_PWA_FILTERS,
  matchesPwaFilters,
  type IPwaFilters,
  type IPwaFilterContext,
} from "./pwaFilters";

function conversation(overrides: Partial<IConversation> = {}): IConversation {
  return {
    id: "c1",
    storeId: "s1",
    channel: "whatsapp",
    status: "aguardando",
    isSdrActive: false,
    tags: [],
    lastMessageAt: "2026-08-11T09:00:00.000Z",
    unreadCount: 0,
    createdAt: "2026-08-11T08:00:00.000Z",
    ...overrides,
  };
}

const CONTEXT: IPwaFilterContext = {
  name: "Transportes Fronteira Oeste",
  phone: "(55) 99820-1177",
  sellerId: "seller-1",
};

function filters(overrides: Partial<IPwaFilters> = {}): IPwaFilters {
  return { ...EMPTY_PWA_FILTERS, ...overrides };
}

describe("matchesPwaFilters — search", () => {
  it("matches part of the name, case-insensitively", () => {
    expect(matchesPwaFilters(conversation(), filters({ q: "fronteira" }), CONTEXT)).toBe(true);
  });

  it("matches the phone by digits, ignoring the mask the user did not type", () => {
    expect(matchesPwaFilters(conversation(), filters({ q: "55998201177" }), CONTEXT)).toBe(true);
    expect(matchesPwaFilters(conversation(), filters({ q: "99820" }), CONTEXT)).toBe(true);
    expect(matchesPwaFilters(conversation(), filters({ q: "99820-1177" }), CONTEXT)).toBe(true);
  });

  it("rejects a search that matches neither name nor phone", () => {
    expect(matchesPwaFilters(conversation(), filters({ q: "pawimac" }), CONTEXT)).toBe(false);
  });

  it("ignores the other filters while searching — same rule as the desktop inbox", () => {
    const resolved = conversation({ status: "resolvida", channel: "site" });
    const narrow = filters({ q: "fronteira", status: "aguardando", channel: "whatsapp" });
    expect(matchesPwaFilters(resolved, narrow, CONTEXT)).toBe(true);
  });

  it("treats a whitespace-only search as no search at all", () => {
    const resolved = conversation({ status: "resolvida" });
    expect(matchesPwaFilters(resolved, filters({ q: "   ", status: "aguardando" }), CONTEXT)).toBe(
      false,
    );
  });
});

describe("matchesPwaFilters — facets", () => {
  it("filters by status", () => {
    expect(matchesPwaFilters(conversation(), filters({ status: "aguardando" }), CONTEXT)).toBe(true);
    expect(matchesPwaFilters(conversation(), filters({ status: "resolvida" }), CONTEXT)).toBe(false);
  });

  it("filters by channel", () => {
    expect(matchesPwaFilters(conversation(), filters({ channel: "whatsapp" }), CONTEXT)).toBe(true);
    expect(matchesPwaFilters(conversation(), filters({ channel: "phone" }), CONTEXT)).toBe(false);
  });

  it("'me' keeps only conversations assigned to the current seller", () => {
    const mine = conversation({ assignedSellerId: "seller-1" });
    const theirs = conversation({ assignedSellerId: "seller-2" });
    expect(matchesPwaFilters(mine, filters({ assign: "me" }), CONTEXT)).toBe(true);
    expect(matchesPwaFilters(theirs, filters({ assign: "me" }), CONTEXT)).toBe(false);
  });

  it("'me' matches nothing when the current user has no seller identity", () => {
    const mine = conversation({ assignedSellerId: "seller-1" });
    expect(matchesPwaFilters(mine, filters({ assign: "me" }), { ...CONTEXT, sellerId: null })).toBe(
      false,
    );
  });

  it("'queue' keeps only unassigned conversations", () => {
    expect(matchesPwaFilters(conversation(), filters({ assign: "queue" }), CONTEXT)).toBe(true);
    expect(
      matchesPwaFilters(
        conversation({ assignedSellerId: "seller-2" }),
        filters({ assign: "queue" }),
        CONTEXT,
      ),
    ).toBe(false);
  });

  it("accepts everything with the empty filter set", () => {
    expect(matchesPwaFilters(conversation({ status: "resolvida" }), EMPTY_PWA_FILTERS, CONTEXT)).toBe(
      true,
    );
  });
});

describe("activeFilterCount", () => {
  it("counts only the facets, never the search box", () => {
    expect(activeFilterCount(filters({ q: "fronteira" }))).toBe(0);
    expect(activeFilterCount(filters({ status: "aguardando" }))).toBe(1);
    expect(activeFilterCount(filters({ status: "aguardando", channel: "phone", assign: "me" }))).toBe(
      3,
    );
  });
});
