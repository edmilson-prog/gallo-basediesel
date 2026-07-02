import { describe, expect, it, vi } from "vitest";
import { createCatchUpStatusHandler } from "./useRealtimeConversations";

/**
 * Unit tests for the pure catch-up factory (node env, per the project's
 * testing convention — the hook is a thin effect over this helper).
 *
 * postgres_changes has no replay: any join transition (boot, auth re-join,
 * socket reconnect) may land AFTER events the channel never delivered. The
 * handler bumps the refetch tick exactly once per down→SUBSCRIBED transition
 * so the inbox list re-syncs from the server instead of freezing until F5.
 */
describe("createCatchUpStatusHandler", () => {
  it("does not catch up on the initial disconnected snapshot", () => {
    const onCatchUp = vi.fn();
    const handler = createCatchUpStatusHandler(onCatchUp);
    handler(false);
    expect(onCatchUp).not.toHaveBeenCalled();
  });

  it("catches up once when the channel comes up", () => {
    const onCatchUp = vi.fn();
    const handler = createCatchUpStatusHandler(onCatchUp);
    handler(false);
    handler(true);
    expect(onCatchUp).toHaveBeenCalledTimes(1);
  });

  it("does not repeat the catch-up while the channel stays up", () => {
    const onCatchUp = vi.fn();
    const handler = createCatchUpStatusHandler(onCatchUp);
    handler(true);
    handler(true);
    handler(true);
    expect(onCatchUp).toHaveBeenCalledTimes(1);
  });

  it("catches up again after every drop → re-join cycle", () => {
    const onCatchUp = vi.fn();
    const handler = createCatchUpStatusHandler(onCatchUp);
    handler(true);
    handler(false);
    handler(true);
    handler(false);
    handler(true);
    expect(onCatchUp).toHaveBeenCalledTimes(3);
  });

  it("forwards every status to the wrapped listener, in order", () => {
    const forwarded: boolean[] = [];
    const handler = createCatchUpStatusHandler(
      () => {},
      (ok) => forwarded.push(ok),
    );
    handler(false);
    handler(true);
    handler(false);
    expect(forwarded).toEqual([false, true, false]);
  });
});
