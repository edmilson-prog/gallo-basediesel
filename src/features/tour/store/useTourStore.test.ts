import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTourStore } from "./useTourStore";
import { getSeen } from "../storage/tourStorage";
import type { TourDef } from "../types";

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

const DEF: TourDef = {
  key: "rich-x",
  kind: "rich",
  label: "X",
  route: "/x",
  steps: [
    { icon: "a", title: "1", body: "b1" },
    { icon: "a", title: "2", body: "b2" },
    { icon: "a", title: "3", body: "b3" },
  ],
};

beforeEach(() => {
  vi.stubGlobal("localStorage", makeMemoryStorage());
  useTourStore.setState({ activeTour: null, stepIndex: 0, userId: null });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useTourStore", () => {
  it("starts a tour at step 0", () => {
    useTourStore.getState().start(DEF, "u1");
    expect(useTourStore.getState().activeTour?.key).toBe("rich-x");
    expect(useTourStore.getState().stepIndex).toBe(0);
  });

  it("advances and goes back within bounds", () => {
    useTourStore.getState().start(DEF, "u1");
    useTourStore.getState().next();
    expect(useTourStore.getState().stepIndex).toBe(1);
    useTourStore.getState().prev();
    expect(useTourStore.getState().stepIndex).toBe(0);
  });

  it("next() on the last step closes and marks the tour seen", () => {
    useTourStore.getState().start(DEF, "u1");
    useTourStore.getState().next();
    useTourStore.getState().next();
    expect(useTourStore.getState().stepIndex).toBe(2); // last
    useTourStore.getState().next(); // past last => close
    expect(useTourStore.getState().activeTour).toBeNull();
    expect(getSeen("u1").has("rich-x")).toBe(true);
  });

  it("close() marks seen and clears state", () => {
    useTourStore.getState().start(DEF, "u1");
    useTourStore.getState().close();
    expect(useTourStore.getState().activeTour).toBeNull();
    expect(getSeen("u1").has("rich-x")).toBe(true);
  });
});
