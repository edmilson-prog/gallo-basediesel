import { describe, it, expect } from "vitest";
import type { IConversation } from "@/shared/types";
import { markConversationReadInList } from "./markRead";

function conv(id: string, unreadCount: number): IConversation {
  return { id, unreadCount } as IConversation;
}

describe("markConversationReadInList", () => {
  it("zeroes the unread count of the matching conversation", () => {
    const prev = [conv("a", 3), conv("b", 5)];
    const next = markConversationReadInList(prev, "b");
    expect(next[1]!.unreadCount).toBe(0);
    expect(next[0]!.unreadCount).toBe(3);
  });

  it("returns the SAME array reference when the id is absent", () => {
    // The whole point. `.map()` returns a fresh array even when nothing matched,
    // and an effect that depends on the list then re-runs forever whenever its
    // exit condition lives in some OTHER state — the 2026-08-11 Inbox freeze:
    // a PINNED conversation with unread > 0 sitting outside the paginated
    // window made the read-reset effect loop, firing markRead() on every turn.
    const prev = [conv("a", 3), conv("b", 5)];
    expect(markConversationReadInList(prev, "missing")).toBe(prev);
  });

  it("returns the SAME array reference when the conversation is already read", () => {
    const prev = [conv("a", 0), conv("b", 0)];
    expect(markConversationReadInList(prev, "a")).toBe(prev);
  });

  it("returns the SAME array reference for an empty list", () => {
    const prev: IConversation[] = [];
    expect(markConversationReadInList(prev, "a")).toBe(prev);
  });

  it("does not mutate the previous array or its items", () => {
    const prev = [conv("a", 3)];
    const before = prev[0]!;
    const next = markConversationReadInList(prev, "a");
    expect(prev[0]!.unreadCount).toBe(3);
    expect(prev[0]).toBe(before);
    expect(next).not.toBe(prev);
    expect(next[0]).not.toBe(before);
  });

  it("keeps the identity of every row it did not touch", () => {
    // Rows that did not change must keep their reference so `memo()` on the row
    // component can still bail out.
    const untouched = conv("a", 1);
    const prev = [untouched, conv("b", 2)];
    const next = markConversationReadInList(prev, "b");
    expect(next[0]).toBe(untouched);
  });

  it("zeroes only the first match, leaving a duplicate id untouched", () => {
    const prev = [conv("a", 2), conv("a", 4)];
    const next = markConversationReadInList(prev, "a");
    expect(next[0]!.unreadCount).toBe(0);
    expect(next[1]!.unreadCount).toBe(4);
  });
});
