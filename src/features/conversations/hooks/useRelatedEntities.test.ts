import { describe, it, expect } from "vitest";
import type { ID, IConversation, IMessage } from "@/shared/types";
import { missingIds, newerMessage } from "./useRelatedEntities";

/**
 * Unit tests for the pure core of `useRelatedEntities` (node env — no DOM, no
 * `@testing-library/react`, per the project's testing convention). The hook is a
 * thin effect over these helpers; together they encode the fix for the
 * "Lead anônimo" list regression: each conversation's contact is requested at
 * most once (keyed by conversation id), so the recency reordering that constantly
 * replaces the conversation array can no longer restart the resolution batch and
 * blank already-resolved rows.
 */

/** Minimal conversation fixture — only the fields the resolver reads. */
function conv(id: string, customerId?: string, leadId?: string): IConversation {
  return { id, customerId, leadId } as unknown as IConversation;
}

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
  it("requests each conversation's contact at most once across repeated reorders", () => {
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

    // Simulate the effect's accumulating contact cache (keyed by conversation id).
    const cache = new Map<ID, true>();
    const requested: ID[] = [];
    for (const list of reorderings) {
      const convIds = list.map((c) => c.id);
      for (const id of missingIds(convIds, cache)) {
        requested.push(id);
        cache.set(id, true); // resolved + cached
      }
    }

    // Despite 5 reorders, each conversation's contact is requested exactly once —
    // the old implementation re-fetched (and could blank) the whole set every run.
    expect(requested.sort()).toEqual(["conv-1", "conv-2"]);
    expect(cache.size).toBe(2);
  });

  it("requests only the newly-arrived conversation when the set grows", () => {
    const cache = new Map<ID, true>([["conv-1", true]]);
    const list = [conv("conv-1", "custA"), conv("conv-2", "custB")];
    const convIds = list.map((c) => c.id);
    expect(missingIds(convIds, cache)).toEqual(["conv-2"]);
  });
});
