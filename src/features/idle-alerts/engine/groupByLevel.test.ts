import { describe, expect, it } from "vitest";
import { groupByLevel } from "./groupByLevel";
import type { IIdleConversationEntry } from "@/shared/types";

function entry(level: 1 | 2 | 3, id: string): IIdleConversationEntry {
  return {
    conversationId: id,
    contactName: `c-${id}`,
    lastInboundPreview: null,
    awaitingReplySince: "2026-07-16T10:00:00.000Z",
    businessSeconds: level * 10_000,
    level,
  };
}

describe("groupByLevel", () => {
  it("splits entries by level keeping order", () => {
    const groups = groupByLevel([entry(3, "a"), entry(1, "b"), entry(2, "c"), entry(3, "d")]);
    expect(groups.critical.map((e) => e.conversationId)).toEqual(["a", "d"]);
    expect(groups.alert.map((e) => e.conversationId)).toEqual(["c"]);
    expect(groups.attention.map((e) => e.conversationId)).toEqual(["b"]);
  });
});
