import { describe, it, expect } from "vitest";
import { hasNewDeploy, shouldReopenPrompt, shouldAttemptChunkReload } from "./deployGate";

describe("hasNewDeploy", () => {
  it("false when build ids match", () => expect(hasNewDeploy("a.1", "a.1")).toBe(false));
  it("true when build ids differ", () => expect(hasNewDeploy("a.1", "b.2")).toBe(true));
  it("false when remote is null (no info / fetch failed)", () =>
    expect(hasNewDeploy("a.1", null)).toBe(false));
  it("false when remote is empty", () => expect(hasNewDeploy("a.1", "")).toBe(false));
});

describe("shouldReopenPrompt", () => {
  const INTERVAL = 15 * 60_000;
  it("false when never dismissed", () =>
    expect(shouldReopenPrompt(null, 1_000, INTERVAL)).toBe(false));
  it("false before the interval elapses", () =>
    expect(shouldReopenPrompt(1_000, 1_000 + INTERVAL - 1, INTERVAL)).toBe(false));
  it("true once the interval elapses", () =>
    expect(shouldReopenPrompt(1_000, 1_000 + INTERVAL, INTERVAL)).toBe(true));
});

describe("shouldAttemptChunkReload", () => {
  it("true when no prior attempt this session", () =>
    expect(shouldAttemptChunkReload(null, "a.1")).toBe(true));
  it("true when the stored attempt was a different build", () =>
    expect(shouldAttemptChunkReload("old.0", "a.1")).toBe(true));
  it("false when we already reloaded for this exact build (loop guard)", () =>
    expect(shouldAttemptChunkReload("a.1", "a.1")).toBe(false));
});
