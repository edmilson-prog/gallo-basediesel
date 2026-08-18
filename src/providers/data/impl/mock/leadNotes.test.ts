import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockLeadsProvider } from "./leads";

describe("mock lead notes", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("appends and lists notes newest-first", async () => {
    // `createdAt` has millisecond resolution; two real back-to-back calls can
    // tie, which would make the newest-first sort ambiguous. Drive the clock
    // deterministically instead of relying on a real wall-clock delay.
    vi.setSystemTime(new Date("2026-07-20T12:00:00.000Z"));
    await mockLeadsProvider.addNote("lead-x", "primeira", "seller-1");
    vi.setSystemTime(new Date("2026-07-20T12:00:01.000Z"));
    await mockLeadsProvider.addNote("lead-x", "segunda", "seller-1");
    const notes = await mockLeadsProvider.listNotes("lead-x");
    expect(notes).toHaveLength(2);
    expect(notes[0]!.content).toBe("segunda");
    expect(notes[0]!.authorId).toBe("seller-1");
  });
});
