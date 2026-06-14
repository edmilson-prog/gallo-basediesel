import { describe, it, expect } from "vitest";
import type { IConversationNote } from "@/shared/types";
import { filterNotes } from "./notesConsult";

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

describe("filterNotes", () => {
  const notes = [
    note({ id: "a", content: "cliente pediu desconto", mentions: ["me"] }),
    note({ id: "b", content: "confere o estoque", pinned: true }),
    note({ id: "c", content: "ligar amanhã" }),
  ];

  it("returns all notes with the default scope and empty query", () => {
    expect(filterNotes(notes, { query: "", scope: "all" }, "me").map((n) => n.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("filters by a case-insensitive content substring", () => {
    expect(filterNotes(notes, { query: "DESC", scope: "all" }, "me").map((n) => n.id)).toEqual([
      "a",
    ]);
  });

  it("keeps only notes that mention the current seller", () => {
    expect(filterNotes(notes, { query: "", scope: "mentions" }, "me").map((n) => n.id)).toEqual([
      "a",
    ]);
  });

  it("returns nothing for the mentions scope when there is no current seller", () => {
    expect(filterNotes(notes, { query: "", scope: "mentions" }, undefined)).toEqual([]);
  });

  it("keeps only pinned notes", () => {
    expect(filterNotes(notes, { query: "", scope: "pinned" }, "me").map((n) => n.id)).toEqual([
      "b",
    ]);
  });

  it("combines scope and query", () => {
    expect(
      filterNotes(notes, { query: "estoque", scope: "pinned" }, "me").map((n) => n.id),
    ).toEqual(["b"]);
    expect(filterNotes(notes, { query: "estoque", scope: "mentions" }, "me")).toEqual([]);
  });
});
