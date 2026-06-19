import { describe, it, expect } from "vitest";
import type { ID, IConversation, IMessage } from "@/shared/types";
import { collectRelatedIds, missingIds, newerMessage } from "./useRelatedEntities";

/**
 * Unit tests for the pure core of `useRelatedEntities` (node env — no DOM, no
 * `@testing-library/react`, per the project's testing convention). The hook is
 * a thin effect over these two functions; together they encode the fix for the
 * "Lead anônimo" list regression: contacts are deduped and fetched at most once,
 * so the recency reordering that constantly replaces the conversation array can
 * no longer restart the resolution batch and blank already-resolved rows.
 */

/** Minimal conversation fixture — only the fields the resolver reads. */
function conv(id: string, customerId?: string, leadId?: string): IConversation {
  return { id, customerId, leadId } as unknown as IConversation;
}

describe("collectRelatedIds", () => {
  it("dedupes repeated customer ids", () => {
    const { customerIds } = collectRelatedIds([
      conv("c1", "custA"),
      conv("c2", "custA"),
      conv("c3", "custB"),
    ]);
    expect(customerIds).toEqual(["custA", "custB"]);
  });

  it("drops conversations without a customer/lead link", () => {
    const { customerIds, leadIds } = collectRelatedIds([
      conv("c1"),
      conv("c2", "custA"),
      conv("c3", undefined, "leadZ"),
    ]);
    expect(customerIds).toEqual(["custA"]);
    expect(leadIds).toEqual(["leadZ"]);
  });

  it("separates customer ids from lead ids", () => {
    const { customerIds, leadIds } = collectRelatedIds([
      conv("c1", "custA"),
      conv("c2", undefined, "leadB"),
    ]);
    expect(customerIds).toEqual(["custA"]);
    expect(leadIds).toEqual(["leadB"]);
  });
});

describe("missingIds", () => {
  it("returns only ids absent from the cache", () => {
    const cache = new Map<ID, true>([["a", true]]);
    expect(missingIds(["a", "b", "c"], cache)).toEqual(["b", "c"]);
  });

  it("returns nothing once everything is cached", () => {
    const cache = new Map<ID, true>([
      ["a", true],
      ["b", true],
    ]);
    expect(missingIds(["a", "b"], cache)).toEqual([]);
  });
});

describe("newerMessage", () => {
  function msg(id: string, sentAt: string): IMessage {
    return { id, sentAt } as unknown as IMessage;
  }

  it("takes the fresh message when nothing is cached", () => {
    const next = msg("m1", "2026-06-19T10:00:00.000Z");
    expect(newerMessage(undefined, next)).toBe(next);
  });

  it("keeps the newer message when the fresh one is more recent", () => {
    const prev = msg("m1", "2026-06-19T10:00:00.000Z");
    const next = msg("m2", "2026-06-19T10:05:00.000Z");
    expect(newerMessage(prev, next)).toBe(next);
  });

  it("does not let a stale (older) out-of-order result stomp a newer preview", () => {
    const newer = msg("m2", "2026-06-19T10:05:00.000Z");
    const olderLateArrival = msg("m1", "2026-06-19T10:00:00.000Z");
    // An overlapping run's slow lookup resolves after the newer one — must keep newer.
    expect(newerMessage(newer, olderLateArrival)).toBe(newer);
  });
});

describe("resolution is stable under reordering (the list-regression fix)", () => {
  it("fetches each contact at most once across repeated reorders", () => {
    const a = conv("conv-1", "custA");
    const b = conv("conv-2", "custB");

    // The inbox is sorted by recency: on a busy instance the same set of
    // conversations is handed back in a different order on every realtime tick.
    const reorderings: IConversation[][] = [
      [a, b],
      [b, a],
      [a, b],
      [b, a],
      [a, b],
    ];

    // Simulate the effect's accumulating cache across those runs.
    const cache = new Map<ID, true>();
    const fetched: ID[] = [];
    for (const list of reorderings) {
      const { customerIds } = collectRelatedIds(list);
      for (const id of missingIds(customerIds, cache)) {
        fetched.push(id);
        cache.set(id, true); // resolved + cached
      }
    }

    // Despite 5 reorders, each customer is fetched exactly once — the old
    // implementation re-fetched (and could blank) the whole set every run.
    expect(fetched.sort()).toEqual(["custA", "custB"]);
    expect(cache.size).toBe(2);
  });

  it("fetches only the newly-arrived contact when the set grows", () => {
    const cache = new Map<ID, true>([["custA", true]]);
    const list = [conv("conv-1", "custA"), conv("conv-2", "custB")];
    const { customerIds } = collectRelatedIds(list);
    expect(missingIds(customerIds, cache)).toEqual(["custB"]);
  });
});
