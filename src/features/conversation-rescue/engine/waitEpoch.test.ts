import { describe, it, expect } from "vitest";
import { isSameWaitEpoch } from "./waitEpoch";
import { MAX_BROADCASTS_PER_TICK, MAX_FORCED_ASSIGNMENTS_PER_TICK } from "./tickLimits";

const BROADCAST_AT = "2026-07-18T17:00:00-03:00";

describe("isSameWaitEpoch", () => {
  it("accepts a wait that started before the broadcast (the normal case)", () => {
    expect(isSameWaitEpoch("2026-07-18T16:45:00-03:00", BROADCAST_AT)).toBe(true);
  });

  it("rejects a wait that started AFTER the broadcast (new epoch)", () => {
    // Absent seller replied (clock cleared), client asked something new.
    expect(isSameWaitEpoch("2026-07-18T17:02:40-03:00", BROADCAST_AT)).toBe(false);
  });

  it("is inclusive at the boundary — same instant is still the same epoch", () => {
    expect(isSameWaitEpoch(BROADCAST_AT, BROADCAST_AT)).toBe(true);
  });

  it("rejects a cleared clock (seller answered and nobody is waiting)", () => {
    expect(isSameWaitEpoch(null, BROADCAST_AT)).toBe(false);
  });

  it("fails closed on unparseable input instead of authorising a force", () => {
    expect(isSameWaitEpoch("not-a-date", BROADCAST_AT)).toBe(false);
    expect(isSameWaitEpoch("2026-07-18T16:45:00-03:00", "not-a-date")).toBe(false);
    expect(isSameWaitEpoch("", BROADCAST_AT)).toBe(false);
  });

  it("survives a months-old backlog wait (still the same epoch)", () => {
    expect(isSameWaitEpoch("2025-01-30T13:38:37-03:00", BROADCAST_AT)).toBe(true);
  });
});

describe("tick limits", () => {
  it("caps broadcasts and forced assignments per tick", () => {
    expect(MAX_BROADCASTS_PER_TICK).toBe(10);
    expect(MAX_FORCED_ASSIGNMENTS_PER_TICK).toBe(5);
  });

  it("keeps forcing strictly more conservative than broadcasting", () => {
    // Forcing is the irreversible step — it must never outpace the voluntary
    // path that gives online sellers a chance to claim first.
    expect(MAX_FORCED_ASSIGNMENTS_PER_TICK).toBeLessThan(MAX_BROADCASTS_PER_TICK);
  });
});
