import { describe, it, expect } from "vitest";
import {
  conversationTouchedAt,
  conversationTouchMatches,
  messageRowMatches,
  touchAlreadyCovered,
} from "./useRealtimeMessages";

/**
 * Unit tests for the pure predicates of `useRealtimeMessages` (node env — no
 * DOM, no `@testing-library/react`, per the project's testing convention).
 *
 * These gate the two Realtime channels the open thread listens to: the fast
 * `messages` path (`messageRowMatches`) and the `conversations` touch fallback
 * (`conversationTouchMatches`). Both must fire ONLY for the open conversation —
 * a touch of any other conversation must never trigger this thread's catch-up.
 */

describe("messageRowMatches", () => {
  it("matches a row of the open conversation", () => {
    expect(messageRowMatches({ id: "m1", conversation_id: "conv-1" }, "conv-1")).toBe(true);
  });

  it("rejects a row of a different conversation", () => {
    expect(messageRowMatches({ id: "m1", conversation_id: "conv-2" }, "conv-1")).toBe(false);
  });

  it("rejects a row without an id (e.g. a DELETE with default replica identity)", () => {
    expect(messageRowMatches({ conversation_id: "conv-1" }, "conv-1")).toBe(false);
  });

  it("rejects a null/undefined row", () => {
    expect(messageRowMatches(null, "conv-1")).toBe(false);
    expect(messageRowMatches(undefined, "conv-1")).toBe(false);
  });
});

describe("conversationTouchMatches", () => {
  it("matches a touch of the open conversation", () => {
    expect(conversationTouchMatches({ id: "conv-1" }, "conv-1")).toBe(true);
  });

  it("rejects a touch of a different conversation", () => {
    expect(conversationTouchMatches({ id: "conv-2" }, "conv-1")).toBe(false);
  });

  it("rejects a row without an id", () => {
    expect(conversationTouchMatches({ status: "em_andamento" }, "conv-1")).toBe(false);
  });

  it("rejects a null/undefined row", () => {
    expect(conversationTouchMatches(null, "conv-1")).toBe(false);
    expect(conversationTouchMatches(undefined, "conv-1")).toBe(false);
  });
});

describe("conversationTouchedAt", () => {
  it("reads last_message_at off the touch row", () => {
    expect(conversationTouchedAt({ id: "conv-1", last_message_at: "2026-06-30T10:00:00.000Z" })).toBe(
      "2026-06-30T10:00:00.000Z",
    );
  });

  it("returns undefined when the row has no last_message_at", () => {
    expect(conversationTouchedAt({ id: "conv-1" })).toBeUndefined();
    expect(conversationTouchedAt(null)).toBeUndefined();
    expect(conversationTouchedAt(undefined)).toBeUndefined();
  });
});

describe("touchAlreadyCovered (gap B — skip the redundant syncLatest)", () => {
  it("is not covered when the fast path has applied nothing yet", () => {
    expect(touchAlreadyCovered("2026-06-30T10:00:00.000Z", undefined)).toBe(false);
  });

  it("is not covered when the touch has no timestamp", () => {
    expect(touchAlreadyCovered(undefined, "2026-06-30T10:00:00.000Z")).toBe(false);
  });

  it("is covered when the fast path already applied a message at or after the touch", () => {
    expect(touchAlreadyCovered("2026-06-30T10:00:00.000Z", "2026-06-30T10:00:00.000Z")).toBe(true);
    expect(touchAlreadyCovered("2026-06-30T10:00:00.000Z", "2026-06-30T10:00:05.000Z")).toBe(true);
  });

  it("is not covered when the touch is newer than what the fast path applied", () => {
    expect(touchAlreadyCovered("2026-06-30T10:00:05.000Z", "2026-06-30T10:00:00.000Z")).toBe(false);
  });
});
