import { describe, it, expect } from "vitest";
import { instanceAccent, accountAccent } from "./instanceAccent";

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

describe("accountAccent", () => {
  it("uses the explicit accentColor when set", () => {
    expect(accountAccent({ id: "x", providerConfig: { accentColor: "#ff00aa" } })).toBe("#ff00aa");
  });
  it("falls back to the id hash when accentColor is absent", () => {
    expect(accountAccent({ id: "wa-evo-campanhas", providerConfig: {} })).toBe(
      instanceAccent("wa-evo-campanhas"),
    );
  });
  it("falls back when providerConfig is undefined", () => {
    expect(accountAccent({ id: "wa-evo-campanhas" })).toBe(instanceAccent("wa-evo-campanhas"));
  });
});
