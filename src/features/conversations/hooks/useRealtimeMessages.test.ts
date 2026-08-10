import { describe, it, expect } from "vitest";
import { conversationTouchMatches, messageRowMatches, rowToMessage } from "./useRealtimeMessages";

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

describe("rowToMessage — reply_to", () => {
  it("maps the quoted snapshot into replyTo", () => {
    const row = {
      id: "m1",
      conversation_id: "c1",
      direction: "in",
      author_type: "customer",
      author_id: null,
      provider: "waha",
      text: "esse mesmo",
      media_type: null,
      media_url: null,
      media_filename: null,
      status: "delivered",
      sent_at: "2026-08-10T12:00:00.000Z",
      delivered_at: null,
      read_at: null,
      failure_reason: null,
      failure_code: null,
      transcription: null,
      transcription_status: null,
      reply_to: {
        messageId: "m0",
        providerMessageId: "false_5555912345678@c.us_ABC",
        text: "Tem o filtro de óleo do Volvo FH?",
        direction: "out",
      },
    } as never;

    expect(rowToMessage(row).replyTo).toEqual({
      messageId: "m0",
      providerMessageId: "false_5555912345678@c.us_ABC",
      text: "Tem o filtro de óleo do Volvo FH?",
      direction: "out",
    });
  });

  it("leaves replyTo undefined when the column is null", () => {
    const row = { id: "m1", conversation_id: "c1", reply_to: null } as never;
    expect(rowToMessage(row).replyTo).toBeUndefined();
  });
});
