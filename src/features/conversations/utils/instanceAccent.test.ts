import { describe, it, expect } from "vitest";
import { instanceAccent } from "./instanceAccent";

describe("instanceAccent", () => {
  it("is deterministic for the same id", () => {
    expect(instanceAccent("wa-evo-campanhas")).toBe(instanceAccent("wa-evo-campanhas"));
  });
  it("returns a hex from the closed palette", () => {
    expect(instanceAccent("wa-evo-campanhas")).toMatch(/^#[0-9a-f]{6}$/i);
  });
  it("does not collide with severity colors", () => {
    const severity = ["#22c55e", "#f59e0b", "#f87171", "#ef4444"];
    expect(severity).not.toContain(instanceAccent("any-id"));
  });
});
