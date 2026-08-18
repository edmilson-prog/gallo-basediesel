import { describe, expect, it } from "vitest";
import { resolveThreadStick } from "./threadAutoScroll";

/**
 * Decides when the thread scroller sticks to the bottom. Mirrors the desktop
 * MessageList semantics: the FIRST load always lands on the newest message,
 * loading older pages never moves the user, and a new message only pulls the
 * user down when they were already at the bottom.
 *
 * The previous count-delta heuristic (`grew by <= 3 rows`) misclassified the
 * initial 50-row page as "loaded history" — every conversation with more than
 * 3 messages opened at the top. Tracking the LAST message id instead makes the
 * two growth directions unambiguous: growth at the end changes the last id,
 * growth at the top never does.
 */
describe("resolveThreadStick", () => {
  it("sticks on the first loaded page even when not at the bottom", () => {
    // Opening a conversation: ref starts null, first page arrives (any size).
    const decision = resolveThreadStick(null, "m-50", false);
    expect(decision).toEqual({ stick: true, lastId: "m-50" });
  });

  it("does nothing while the thread is still empty", () => {
    const decision = resolveThreadStick(null, null, true);
    expect(decision).toEqual({ stick: false, lastId: null });
  });

  it("still treats the load after an empty paint as the first load", () => {
    // Mount paints with [] (loading), then page 1 resolves.
    const empty = resolveThreadStick(null, null, true);
    const loaded = resolveThreadStick(empty.lastId, "m-50", false);
    expect(loaded.stick).toBe(true);
  });

  it("stays put when older pages grow the thread at the top", () => {
    // "Ver mensagens anteriores": last message is unchanged, even at bottom.
    const decision = resolveThreadStick("m-50", "m-50", true);
    expect(decision).toEqual({ stick: false, lastId: "m-50" });
  });

  it("sticks when a new message arrives while pinned at the bottom", () => {
    const decision = resolveThreadStick("m-50", "m-51", true);
    expect(decision).toEqual({ stick: true, lastId: "m-51" });
  });

  it("stays put when a new message arrives while reading history", () => {
    const decision = resolveThreadStick("m-50", "m-51", false);
    expect(decision).toEqual({ stick: false, lastId: "m-51" });
  });

  it("keeps the known last id when a refetch briefly empties the list", () => {
    // The id survives so the refill is not mistaken for a first load.
    const decision = resolveThreadStick("m-50", null, true);
    expect(decision).toEqual({ stick: false, lastId: "m-50" });
  });
});
