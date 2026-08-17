import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  COLUMN_LABELS,
  OPTIONAL_COLUMNS,
  readVisibleOptional,
  writeVisibleOptional,
} from "./columns";

/**
 * In-memory localStorage stand-in for the node test environment (vitest.config.ts
 * runs `environment: "node"`, which has no `window`). Same shape as
 * `src/features/auth/rememberEmail.test.ts`.
 */
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

describe("supplier column visibility", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { localStorage: createMemoryStorage() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows every optional column by default", () => {
    expect(readVisibleOptional()).toEqual([...OPTIONAL_COLUMNS]);
  });

  it("round-trips a saved selection", () => {
    writeVisibleOptional(["terms", "contact"]);
    expect(readVisibleOptional()).toEqual(["terms", "contact"]);
  });

  it("ignores unknown ids left by an older build", () => {
    window.localStorage.setItem(
      "gallo-suppliers-visible-columns",
      JSON.stringify(["terms", "otif"]),
    );
    expect(readVisibleOptional()).toEqual(["terms"]);
  });

  it("labels every optional column in Portuguese", () => {
    for (const id of OPTIONAL_COLUMNS) {
      expect(COLUMN_LABELS[id]).toBeTruthy();
    }
  });
});
