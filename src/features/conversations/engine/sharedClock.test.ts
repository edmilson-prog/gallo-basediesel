import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { subscribeToClock, activeClockCount } from "./sharedClock";

describe("sharedClock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens ONE timer for many subscribers on the same interval", () => {
    const spy = vi.spyOn(globalThis, "setInterval");
    // The Inbox shape: one subscriber per conversation row.
    const unsubscribes = Array.from({ length: 50 }, () => subscribeToClock(60_000, () => {}));

    expect(spy).toHaveBeenCalledTimes(1);
    expect(activeClockCount()).toBe(1);

    unsubscribes.forEach((off) => off());
  });

  it("ticks every subscriber with the SAME Date instance", () => {
    const seen: Date[] = [];
    const offs = [
      subscribeToClock(60_000, (d) => seen.push(d)),
      subscribeToClock(60_000, (d) => seen.push(d)),
      subscribeToClock(60_000, (d) => seen.push(d)),
    ];

    vi.advanceTimersByTime(60_000);

    expect(seen).toHaveLength(3);
    // Same instance => downstream memoization behaves identically for all rows,
    // and they all re-render on one tick instead of on scattered phases.
    expect(seen[1]).toBe(seen[0]);
    expect(seen[2]).toBe(seen[0]);

    offs.forEach((off) => off());
  });

  it("keeps separate timers for different interval lengths", () => {
    const offA = subscribeToClock(60_000, () => {});
    const offB = subscribeToClock(1_000, () => {});
    expect(activeClockCount()).toBe(2);
    offA();
    offB();
  });

  it("clears the timer only when the LAST subscriber leaves", () => {
    const clearSpy = vi.spyOn(globalThis, "clearInterval");
    const offA = subscribeToClock(60_000, () => {});
    const offB = subscribeToClock(60_000, () => {});

    offA();
    expect(clearSpy).not.toHaveBeenCalled();
    expect(activeClockCount()).toBe(1);

    offB();
    expect(clearSpy).toHaveBeenCalledTimes(1);
    expect(activeClockCount()).toBe(0);
  });

  it("stops ticking a subscriber after it unsubscribes", () => {
    const stays = vi.fn();
    const leaves = vi.fn();
    const offStays = subscribeToClock(60_000, stays);
    const offLeaves = subscribeToClock(60_000, leaves);

    offLeaves();
    vi.advanceTimersByTime(60_000);

    expect(stays).toHaveBeenCalledTimes(1);
    expect(leaves).not.toHaveBeenCalled();

    offStays();
  });

  it("survives a subscriber unsubscribing DURING a tick", () => {
    // A row unmounting from the same tick that re-renders the list would
    // mutate the Set mid-iteration if we did not iterate a copy.
    const other = vi.fn();
    let offSelf = () => {};
    const offSelfHolder = subscribeToClock(60_000, () => offSelf());
    offSelf = offSelfHolder;
    const offOther = subscribeToClock(60_000, other);

    expect(() => vi.advanceTimersByTime(60_000)).not.toThrow();
    expect(other).toHaveBeenCalledTimes(1);

    offOther();
  });

  it("starts a fresh timer after everyone left and someone resubscribes", () => {
    const off1 = subscribeToClock(60_000, () => {});
    off1();
    expect(activeClockCount()).toBe(0);

    const tick = vi.fn();
    const off2 = subscribeToClock(60_000, tick);
    expect(activeClockCount()).toBe(1);

    vi.advanceTimersByTime(60_000);
    expect(tick).toHaveBeenCalledTimes(1);

    off2();
  });
});
