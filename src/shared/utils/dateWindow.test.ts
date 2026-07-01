import { describe, expect, it } from "vitest";
import { previousWindowOfEqualSpan } from "./dateWindow";

describe("previousWindowOfEqualSpan", () => {
  it("returns a window of the same span immediately preceding fromIso", () => {
    const fromIso = "2026-06-10T00:00:00.000Z";
    const toIso = "2026-06-17T00:00:00.000Z";
    const { prevFromIso, prevToIso } = previousWindowOfEqualSpan(fromIso, toIso);
    const span = new Date(toIso).getTime() - new Date(fromIso).getTime();
    expect(new Date(prevToIso).getTime()).toBe(new Date(fromIso).getTime() - 1);
    expect(new Date(prevFromIso).getTime()).toBe(new Date(prevToIso).getTime() - span);
  });

  it("handles a zero-length window without a negative span", () => {
    const fromIso = "2026-06-10T00:00:00.000Z";
    const { prevFromIso, prevToIso } = previousWindowOfEqualSpan(fromIso, fromIso);
    expect(new Date(prevToIso).getTime()).toBe(new Date(fromIso).getTime() - 1);
    expect(new Date(prevFromIso).getTime()).toBe(new Date(prevToIso).getTime());
  });
});
