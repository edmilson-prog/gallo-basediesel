import { describe, it, expect } from "vitest";
import type { IConversationNote } from "@/shared/types";
import { partitionNotes, canEditNote, canManageNote, sellerDisplay } from "./conversationNotes";

function note(over: Partial<IConversationNote>): IConversationNote {
  return {
    id: "n1",
    conversationId: "c1",
    storeId: "store1",
    authorId: "s1",
    content: "nota",
    mentions: [],
    pinned: false,
    createdAt: "2026-06-14T10:00:00.000Z",
    updatedAt: "2026-06-14T10:00:00.000Z",
    ...over,
  };
}

describe("partitionNotes", () => {
  it("separates pinned from the rest", () => {
    const notes = [
      note({ id: "a", pinned: false }),
      note({ id: "b", pinned: true }),
      note({ id: "c", pinned: false }),
    ];
    const { pinned, unpinned } = partitionNotes(notes);
    expect(pinned.map((n) => n.id)).toEqual(["b"]);
    expect(unpinned.map((n) => n.id)).toEqual(["a", "c"]);
  });

  it("orders each group newest first", () => {
    const notes = [
      note({ id: "old", createdAt: "2026-06-14T08:00:00.000Z" }),
      note({ id: "new", createdAt: "2026-06-14T12:00:00.000Z" }),
      note({ id: "mid", createdAt: "2026-06-14T10:00:00.000Z" }),
    ];
    const { unpinned } = partitionNotes(notes);
    expect(unpinned.map((n) => n.id)).toEqual(["new", "mid", "old"]);
  });

  it("does not mutate the input array", () => {
    const notes = [note({ id: "a" }), note({ id: "b" })];
    const snapshot = notes.map((n) => n.id);
    partitionNotes(notes);
    expect(notes.map((n) => n.id)).toEqual(snapshot);
  });
});

describe("canEditNote", () => {
  it("allows the author to edit their own note", () => {
    expect(canEditNote(note({ authorId: "s1" }), "s1")).toBe(true);
  });

  it("forbids editing someone else's note (even for staff — editing is author-only)", () => {
    expect(canEditNote(note({ authorId: "s1" }), "s2")).toBe(false);
  });

  it("forbids editing when there is no current seller", () => {
    expect(canEditNote(note({ authorId: "s1" }), undefined)).toBe(false);
  });
});

describe("canManageNote (delete / pin)", () => {
  it("allows the author", () => {
    expect(canManageNote(note({ authorId: "s1" }), "s1", false)).toBe(true);
  });

  it("allows staff on any note", () => {
    expect(canManageNote(note({ authorId: "s1" }), "s2", true)).toBe(true);
  });

  it("forbids a non-author non-staff", () => {
    expect(canManageNote(note({ authorId: "s1" }), "s2", false)).toBe(false);
  });

  it("forbids when there is no current seller and not staff", () => {
    expect(canManageNote(note({ authorId: "s1" }), undefined, false)).toBe(false);
  });
});

describe("sellerDisplay", () => {
  it("prefers attendantName when set", () => {
    expect(sellerDisplay({ attendantName: "Edm", fullName: "Edmilson Souza" })).toBe("Edm");
  });

  it("falls back to fullName when attendantName is blank or absent", () => {
    expect(sellerDisplay({ attendantName: "   ", fullName: "Edmilson Souza" })).toBe(
      "Edmilson Souza",
    );
    expect(sellerDisplay({ fullName: "Ana" })).toBe("Ana");
  });
});
