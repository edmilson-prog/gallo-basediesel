import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getSeen,
  isSeen,
  markSeen,
  getOptOut,
  setOptOut,
  resetAll,
} from "./tourStorage";

function makeMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", makeMemoryStorage());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("tourStorage", () => {
  it("marks and reads seen tours per user", () => {
    expect(isSeen("u1", "welcome-clientes")).toBe(false);
    markSeen("u1", "welcome-clientes");
    expect(isSeen("u1", "welcome-clientes")).toBe(true);
    expect(getSeen("u1").has("welcome-clientes")).toBe(true);
  });

  it("scopes seen tours by user", () => {
    markSeen("u1", "welcome-leads");
    expect(isSeen("u2", "welcome-leads")).toBe(false);
  });

  it("is idempotent on repeated markSeen", () => {
    markSeen("u1", "x");
    markSeen("u1", "x");
    expect(getSeen("u1").size).toBe(1);
  });

  it("stores and reads the global opt-out per user", () => {
    expect(getOptOut("u1")).toBe(false);
    setOptOut("u1", true);
    expect(getOptOut("u1")).toBe(true);
    setOptOut("u1", false);
    expect(getOptOut("u1")).toBe(false);
  });

  it("resetAll clears seen but keeps opt-out", () => {
    markSeen("u1", "a");
    setOptOut("u1", true);
    resetAll("u1");
    expect(getSeen("u1").size).toBe(0);
    expect(getOptOut("u1")).toBe(true);
  });

  it("returns an empty set on corrupted JSON", () => {
    localStorage.setItem("gallo-tour-seen:u1", "{not json");
    expect(getSeen("u1").size).toBe(0);
  });
});
