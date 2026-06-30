import { describe, it, expect } from "vitest";
import type { IMessage } from "@/shared/types";
import { toAscending } from "./useMessages";

/**
 * Unit tests for the pure core of `useMessages` (node env — no DOM, no
 * `@testing-library/react`, per the project's testing convention).
 *
 * `toAscending` encodes the ordering the `syncLatest` fallback depends on: the
 * provider returns the latest page newest-first, but `applyRealtimeRow` prepends
 * each new row to the HEAD of the newest page — so rows must be applied
 * oldest-first to keep the desc invariant the display memo relies on.
 */

function msg(id: string, sentAt: string): IMessage {
  return { id, sentAt } as unknown as IMessage;
}

describe("toAscending", () => {
  it("returns an empty array for an empty page", () => {
    expect(toAscending([])).toEqual([]);
  });

  it("keeps a single row unchanged", () => {
    const only = msg("m1", "2026-06-30T10:00:00.000Z");
    expect(toAscending([only])).toEqual([only]);
  });

  it("reverses a newest-first page to oldest-first", () => {
    const m3 = msg("m3", "2026-06-30T10:02:00.000Z");
    const m2 = msg("m2", "2026-06-30T10:01:00.000Z");
    const m1 = msg("m1", "2026-06-30T10:00:00.000Z");
    // Provider order is desc (newest first); merge order must be oldest first.
    expect(toAscending([m3, m2, m1])).toEqual([m1, m2, m3]);
  });

  it("does not mutate the input array", () => {
    const desc = [msg("m2", "2026-06-30T10:01:00.000Z"), msg("m1", "2026-06-30T10:00:00.000Z")];
    const snapshot = [...desc];
    toAscending(desc);
    expect(desc).toEqual(snapshot);
  });

  it("prepending the ascending order reconstructs the desc head", () => {
    // Mirror applyRealtimeRow's prependNewest: each row pushed to the head.
    const m3 = msg("m3", "2026-06-30T10:02:00.000Z");
    const m2 = msg("m2", "2026-06-30T10:01:00.000Z");
    const m1 = msg("m1", "2026-06-30T10:00:00.000Z");
    const head: IMessage[] = [];
    for (const row of toAscending([m3, m2, m1])) head.unshift(row);
    // Newest-first (desc) head — the invariant the display memo flips for render.
    expect(head.map((m) => m.id)).toEqual(["m3", "m2", "m1"]);
  });
});
