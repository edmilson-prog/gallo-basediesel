import { describe, expect, it } from "vitest";
import { mockLeadsProvider } from "./leads";

describe("mock lead notes", () => {
  it("appends and lists notes newest-first", async () => {
    await mockLeadsProvider.addNote("lead-x", "primeira", "seller-1");
    // `createdAt` has millisecond resolution; back-to-back calls in a fast
    // test can tie, which would make the newest-first sort ambiguous.
    // Force a real gap so "segunda" is unambiguously the later note.
    await new Promise((resolve) => setTimeout(resolve, 5));
    await mockLeadsProvider.addNote("lead-x", "segunda", "seller-1");
    const notes = await mockLeadsProvider.listNotes("lead-x");
    expect(notes).toHaveLength(2);
    expect(notes[0]!.content).toBe("segunda");
    expect(notes[0]!.authorId).toBe("seller-1");
  });
});
