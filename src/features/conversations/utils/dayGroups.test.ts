import { describe, it, expect } from "vitest";
import type { IMessage, IConversationNote } from "@/shared/types";
import { buildThreadRows } from "./dayGroups";

const NOW = new Date("2026-06-14T18:00:00.000Z");

function msg(id: string, sentAt: string): IMessage {
  return { id, sentAt } as IMessage;
}
function note(id: string, createdAt: string): IConversationNote {
  return { id, createdAt } as IConversationNote;
}

describe("buildThreadRows", () => {
  it("interleaves messages and notes chronologically with a single day separator", () => {
    const rows = buildThreadRows(
      [msg("m1", "2026-06-14T10:00:00.000Z"), msg("m2", "2026-06-14T12:00:00.000Z")],
      [note("n1", "2026-06-14T11:00:00.000Z")],
      NOW,
    );
    expect(rows.map((r) => r.kind)).toEqual(["day", "message", "note", "message"]);
    expect(rows[1]).toMatchObject({ kind: "message", id: "m1" });
    expect(rows[2]).toMatchObject({ kind: "note", id: "note-n1" });
    expect(rows[3]).toMatchObject({ kind: "message", id: "m2" });
  });

  it("adds a new day separator when the day changes", () => {
    const rows = buildThreadRows(
      [msg("m1", "2026-06-13T12:00:00.000Z")],
      [note("n1", "2026-06-14T12:00:00.000Z")],
      NOW,
    );
    expect(rows.map((r) => r.kind)).toEqual(["day", "message", "day", "note"]);
  });

  it("returns an empty array when there is nothing", () => {
    expect(buildThreadRows([], [], NOW)).toEqual([]);
  });

  it("renders notes even when there are no messages", () => {
    const rows = buildThreadRows([], [note("n1", "2026-06-14T12:00:00.000Z")], NOW);
    expect(rows.map((r) => r.kind)).toEqual(["day", "note"]);
    expect(rows[1]).toMatchObject({ kind: "note", id: "note-n1" });
  });
});
