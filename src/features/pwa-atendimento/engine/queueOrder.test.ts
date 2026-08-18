import { describe, expect, it } from "vitest";
import type { IConversation } from "@/shared/types";
import {
  countQueue,
  isQueueEligible,
  pwaQueueListParams,
  sortQueue,
  type IQueueEntry,
} from "./queueOrder";
import { PWA_OPEN_STATUSES } from "./pwaFilters";

const MINUTE = 60_000;

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

function entry(
  id: string,
  waitMinutes: number,
  overrides: Partial<IConversation> = {},
): IQueueEntry {
  return { conversation: conversation({ id, ...overrides }), waitMs: waitMinutes * MINUTE };
}

describe("sortQueue", () => {
  it("puts the longest wait first", () => {
    const sorted = sortQueue([entry("a", 6), entry("b", 34), entry("c", 12)]);
    expect(sorted.map((e) => e.conversation.id)).toEqual(["b", "c", "a"]);
  });

  it("does not mutate the input array", () => {
    const input = [entry("a", 6), entry("b", 34)];
    sortQueue(input);
    expect(input.map((e) => e.conversation.id)).toEqual(["a", "b"]);
  });

  it("breaks ties deterministically by conversation id", () => {
    const sorted = sortQueue([entry("b", 10), entry("a", 10)]);
    expect(sorted.map((e) => e.conversation.id)).toEqual(["a", "b"]);
  });
});

describe("countQueue", () => {
  it("counts each entry in exactly one severity bucket", () => {
    const counters = countQueue([entry("a", 40), entry("b", 12), entry("c", 2)]);
    expect(counters).toEqual({ critical: 1, warning: 1, total: 3 });
  });

  it("treats the thresholds as inclusive", () => {
    const counters = countQueue([entry("a", 30), entry("b", 10)]);
    expect(counters).toEqual({ critical: 1, warning: 1, total: 2 });
  });

  it("returns zeros for an empty queue", () => {
    expect(countQueue([])).toEqual({ critical: 0, warning: 0, total: 0 });
  });
});

describe("isQueueEligible", () => {
  it("keeps conversations still being handled", () => {
    expect(isQueueEligible(conversation({ status: "aguardando" }))).toBe(true);
    expect(isQueueEligible(conversation({ status: "em_andamento" }))).toBe(true);
    expect(isQueueEligible(conversation({ status: "aguardando_cliente" }))).toBe(true);
  });

  it("drops resolved and archived conversations", () => {
    expect(isQueueEligible(conversation({ status: "resolvida" }))).toBe(false);
    expect(isQueueEligible(conversation({ status: "arquivada" }))).toBe(false);
  });
});

describe("pwaQueueListParams", () => {
  it("asks only for pool conversations, oldest first", () => {
    expect(pwaQueueListParams({ storeId: "store-1" })).toEqual({
      storeId: "store-1",
      status: PWA_OPEN_STATUSES,
      assignmentAny: { queue: true },
      orderBy: "lastMessageAt",
      orderDir: "asc",
    });
  });

  it("omits the store when none is selected", () => {
    expect(pwaQueueListParams({ storeId: null }).storeId).toBeUndefined();
  });
});
