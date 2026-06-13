import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearRememberedEmail, readRememberedEmail, saveRememberedEmail } from "./rememberEmail";

/** In-memory localStorage stand-in for the node test environment. */
function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => (map.has(key) ? (map.get(key) as string) : null),
    key: (index) => Array.from(map.keys())[index] ?? null,
    removeItem: (key) => map.delete(key),
    setItem: (key, value) => map.set(key, value),
  };
}

describe("rememberEmail", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { localStorage: createMemoryStorage() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null when nothing was saved", () => {
    expect(readRememberedEmail()).toBeNull();
  });

  it("round-trips a saved email", () => {
    saveRememberedEmail("vendedor@gallobasediesel.com.br");
    expect(readRememberedEmail()).toBe("vendedor@gallobasediesel.com.br");
  });

  it("overwrites a previously saved email", () => {
    saveRememberedEmail("first@gallo.com.br");
    saveRememberedEmail("second@gallo.com.br");
    expect(readRememberedEmail()).toBe("second@gallo.com.br");
  });

  it("clears a saved email", () => {
    saveRememberedEmail("vendedor@gallo.com.br");
    clearRememberedEmail();
    expect(readRememberedEmail()).toBeNull();
  });

  it("treats an empty string as nothing to remember", () => {
    saveRememberedEmail("");
    expect(readRememberedEmail()).toBeNull();
  });

  it("is a no-op without a window (SSR / non-browser)", () => {
    vi.stubGlobal("window", undefined);
    expect(() => saveRememberedEmail("a@b.com")).not.toThrow();
    expect(readRememberedEmail()).toBeNull();
  });

  it("never throws when storage access fails (private mode)", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("denied");
        },
        setItem: () => {
          throw new Error("denied");
        },
        removeItem: () => {
          throw new Error("denied");
        },
      },
    });
    expect(() => saveRememberedEmail("a@b.com")).not.toThrow();
    expect(readRememberedEmail()).toBeNull();
    expect(() => clearRememberedEmail()).not.toThrow();
  });
});
