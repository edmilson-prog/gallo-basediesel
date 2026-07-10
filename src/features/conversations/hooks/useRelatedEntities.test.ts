import { describe, it, expect } from "vitest";
import type { ID, IConversation, IMessage } from "@/shared/types";
import {
  applyLastMessageStatusUpdate,
  changedRecencyIds,
  missingIds,
  newerMessage,
  recencyKeyOf,
} from "./useRelatedEntities";

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

/** Conversation fixture carrying a last-message timestamp (recency key input). */
function convAt(id: string, lastMessageAt: string): IConversation {
  return { id, lastMessageAt } as unknown as IConversation;
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

describe("recencyKeyOf (the stale-preview fix)", () => {
  it("is stable when the set, order and recency are unchanged", () => {
    const list = [
      convAt("conv-1", "2026-06-30T10:00:00.000Z"),
      convAt("conv-2", "2026-06-30T09:00:00.000Z"),
    ];
    expect(recencyKeyOf(list)).toBe(recencyKeyOf([...list]));
  });

  it("changes when the TOP conversation receives a newer message (same order)", () => {
    // The exact bug: conv-1 stays at the top, so the id order is identical, but
    // its last message advanced — the key MUST change so the preview re-resolves.
    const before = [
      convAt("conv-1", "2026-06-30T10:00:00.000Z"),
      convAt("conv-2", "2026-06-30T09:00:00.000Z"),
    ];
    const after = [
      convAt("conv-1", "2026-06-30T10:05:00.000Z"),
      convAt("conv-2", "2026-06-30T09:00:00.000Z"),
    ];
    expect(recencyKeyOf(after)).not.toBe(recencyKeyOf(before));
  });

  it("changes when the conversation order changes", () => {
    const a = convAt("conv-1", "2026-06-30T10:00:00.000Z");
    const b = convAt("conv-2", "2026-06-30T09:00:00.000Z");
    expect(recencyKeyOf([a, b])).not.toBe(recencyKeyOf([b, a]));
  });

  it("changes when a new conversation joins the set", () => {
    const base = [convAt("conv-1", "2026-06-30T10:00:00.000Z")];
    const grown = [...base, convAt("conv-2", "2026-06-30T11:00:00.000Z")];
    expect(recencyKeyOf(grown)).not.toBe(recencyKeyOf(base));
  });
});

describe("changedRecencyIds (gap A — incremental last-message fetch)", () => {
  it("returns every conversation on the first run (nothing seen yet)", () => {
    const list = [convAt("conv-1", "2026-06-30T10:00:00.000Z"), convAt("conv-2", "2026-06-30T09:00:00.000Z")];
    expect(changedRecencyIds(list, new Map())).toEqual(["conv-1", "conv-2"]);
  });

  it("returns only the conversation whose last message actually advanced", () => {
    const lastSeen = new Map<ID, string>([
      ["conv-1", "2026-06-30T10:00:00.000Z"],
      ["conv-2", "2026-06-30T09:00:00.000Z"],
    ]);
    const list = [
      convAt("conv-1", "2026-06-30T10:05:00.000Z"), // advanced
      convAt("conv-2", "2026-06-30T09:00:00.000Z"), // unchanged
    ];
    expect(changedRecencyIds(list, lastSeen)).toEqual(["conv-1"]);
  });

  it("returns nothing when no recency moved (a reorder-only run)", () => {
    const lastSeen = new Map<ID, string>([
      ["conv-1", "2026-06-30T10:00:00.000Z"],
      ["conv-2", "2026-06-30T09:00:00.000Z"],
    ]);
    const list = [convAt("conv-2", "2026-06-30T09:00:00.000Z"), convAt("conv-1", "2026-06-30T10:00:00.000Z")];
    expect(changedRecencyIds(list, lastSeen)).toEqual([]);
  });

  it("includes a newly-arrived conversation even when others are unchanged", () => {
    const lastSeen = new Map<ID, string>([["conv-1", "2026-06-30T10:00:00.000Z"]]);
    const list = [
      convAt("conv-1", "2026-06-30T10:00:00.000Z"),
      convAt("conv-2", "2026-06-30T11:00:00.000Z"),
    ];
    expect(changedRecencyIds(list, lastSeen)).toEqual(["conv-2"]);
  });
});

describe("applyLastMessageStatusUpdate (lost incidental status refresh, 5th round)", () => {
  function statusMsg(id: string, conversationId: string, status: IMessage["status"]): IMessage {
    return { id, conversationId, status, sentAt: "2026-07-10T10:00:00.000Z" } as unknown as IMessage;
  }

  it("returns null when the conversation has no cached preview yet", () => {
    expect(applyLastMessageStatusUpdate(new Map(), statusMsg("m1", "conv-1", "read"))).toBeNull();
  });

  it("returns null when the update targets a different (older) message than the cached preview", () => {
    const cache = new Map([["conv-1", statusMsg("m2", "conv-1", "sent")]]);
    expect(applyLastMessageStatusUpdate(cache, statusMsg("m1", "conv-1", "read"))).toBeNull();
  });

  it("patches the cached preview when the update advances the same message's status", () => {
    const cache = new Map([["conv-1", statusMsg("m1", "conv-1", "delivered")]]);
    const update = statusMsg("m1", "conv-1", "read");
    expect(applyLastMessageStatusUpdate(cache, update)).toBe(update);
  });

  it("returns null when the update would regress the status (out-of-order delivery ack)", () => {
    const cache = new Map([["conv-1", statusMsg("m1", "conv-1", "read")]]);
    expect(applyLastMessageStatusUpdate(cache, statusMsg("m1", "conv-1", "sent"))).toBeNull();
  });

  it("re-applies an equal-rank status idempotently (mirrors statusAdvances)", () => {
    const cache = new Map([["conv-1", statusMsg("m1", "conv-1", "delivered")]]);
    const update = statusMsg("m1", "conv-1", "delivered");
    expect(applyLastMessageStatusUpdate(cache, update)).toBe(update);
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
