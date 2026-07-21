import { describe, expect, it } from "vitest";
import { applyReaction, parseWahaReactionEvent } from "./reaction";

/** Shape from WAHA's documented message.reaction event. */
const payload = {
  id: "false_5511@c.us_AAA",
  fromMe: false,
  timestamp: 1721567423,
  reaction: { text: "🙏", messageId: "true_5511@c.us_BBB" },
};

describe("parseWahaReactionEvent", () => {
  it("reads the target message, emoji and side", () => {
    const parsed = parseWahaReactionEvent(payload);
    expect(parsed.targetProviderMessageId).toBe("true_5511@c.us_BBB");
    expect(parsed.emoji).toBe("🙏");
    expect(parsed.fromMe).toBe(false);
    expect(parsed.timestamp).toBe(new Date(1721567423 * 1000).toISOString());
  });

  it("treats an empty emoji as a removal rather than rejecting it", () => {
    const parsed = parseWahaReactionEvent({ ...payload, reaction: { text: "", messageId: "x" } });
    expect(parsed.emoji).toBe("");
  });

  it("throws when there is no target message id", () => {
    expect(() => parseWahaReactionEvent({ ...payload, reaction: { text: "👍" } })).toThrow(
      /messageId/,
    );
  });

  it("throws when the envelope carries no reaction at all", () => {
    expect(() => parseWahaReactionEvent({ id: "x" })).toThrow(/reaction/);
  });

  // Third-party JSON: a wrong field TYPE must never crash the webhook, which
  // would discard the event instead of degrading.
  it("throws (not crashes) when messageId is not a string", () => {
    expect(() =>
      parseWahaReactionEvent({ ...payload, reaction: { text: "👍", messageId: 123 } }),
    ).toThrow(/messageId/);
  });

  it("treats a non-string emoji as a removal instead of storing it", () => {
    const parsed = parseWahaReactionEvent({
      ...payload,
      reaction: { text: 42, messageId: "m1" },
    });
    expect(parsed.emoji).toBe("");
  });

  it("falls back to now() when the timestamp is not a number", () => {
    expect(() => parseWahaReactionEvent({ ...payload, timestamp: "ontem" })).not.toThrow();
  });
});

describe("applyReaction", () => {
  const at = "2026-07-21T13:10:00.000Z";
  const customerReaction = {
    targetProviderMessageId: "m1",
    emoji: "👍",
    fromMe: false,
    timestamp: at,
  };

  it("adds a customer reaction to an empty state", () => {
    expect(applyReaction(null, customerReaction)).toEqual({ customer: { emoji: "👍", at } });
  });

  it("files a fromMe reaction under the seller slot", () => {
    expect(applyReaction(null, { ...customerReaction, fromMe: true })).toEqual({
      seller: { emoji: "👍", at },
    });
  });

  it("replaces the same side's previous reaction (one per person)", () => {
    const current = { customer: { emoji: "👍", at: "2026-07-20T10:00:00.000Z" } };
    expect(applyReaction(current, { ...customerReaction, emoji: "❤️" })).toEqual({
      customer: { emoji: "❤️", at },
    });
  });

  it("keeps both sides independent", () => {
    const current = { seller: { emoji: "❤️", at } };
    expect(applyReaction(current, customerReaction)).toEqual({
      seller: { emoji: "❤️", at },
      customer: { emoji: "👍", at },
    });
  });

  it("removes only the reacting side when the emoji is empty", () => {
    const current = { customer: { emoji: "👍", at }, seller: { emoji: "❤️", at } };
    expect(applyReaction(current, { ...customerReaction, emoji: "" })).toEqual({
      seller: { emoji: "❤️", at },
    });
  });

  it("collapses to null when the last reaction is removed", () => {
    const current = { customer: { emoji: "👍", at } };
    expect(applyReaction(current, { ...customerReaction, emoji: "" })).toBeNull();
  });

  it("stays null when removing from an empty state", () => {
    expect(applyReaction(null, { ...customerReaction, emoji: "" })).toBeNull();
  });
});
