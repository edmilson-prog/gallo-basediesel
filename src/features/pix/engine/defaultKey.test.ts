import { describe, expect, it } from "vitest";
import { keysToDemote } from "./defaultKey";

describe("keysToDemote", () => {
  it("returns nothing when no other key is default", () => {
    const keys = [
      { id: "a", isDefault: true },
      { id: "b", isDefault: false },
    ];
    expect(keysToDemote(keys, "a")).toEqual([]);
  });

  it("returns the previous default when a different key is promoted", () => {
    const keys = [
      { id: "a", isDefault: true },
      { id: "b", isDefault: false },
    ];
    expect(keysToDemote(keys, "b")).toEqual(["a"]);
  });

  it("never demotes the key being promoted", () => {
    // Promoting the key that is ALREADY default must be a no-op, not a
    // self-demotion that would leave the store with no default at all.
    const keys = [{ id: "a", isDefault: true }];
    expect(keysToDemote(keys, "a")).toEqual([]);
  });

  it("returns every stale default when a previous race left two", () => {
    const keys = [
      { id: "a", isDefault: true },
      { id: "b", isDefault: true },
      { id: "c", isDefault: false },
    ];
    expect(keysToDemote(keys, "c")).toEqual(["a", "b"]);
  });

  it("returns nothing for an empty store", () => {
    expect(keysToDemote([], "a")).toEqual([]);
  });

  it("ignores keys that are not default", () => {
    const keys = [
      { id: "a", isDefault: false },
      { id: "b", isDefault: false },
    ];
    expect(keysToDemote(keys, "a")).toEqual([]);
  });
});
