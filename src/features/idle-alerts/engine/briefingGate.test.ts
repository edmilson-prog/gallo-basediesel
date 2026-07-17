import { describe, expect, it } from "vitest";
import { shouldShowBriefing } from "./briefingGate";
import type { IIdleSummary } from "@/shared/types";

const empty: IIdleSummary = { counts: { level1: 0, level2: 0, level3: 0 }, entries: [] };
const pending: IIdleSummary = {
  counts: { level1: 2, level2: 0, level3: 1 },
  entries: [],
};

describe("shouldShowBriefing", () => {
  it("shows only on explicit login AND with pending items", () => {
    expect(shouldShowBriefing(true, pending)).toBe(true);
    expect(shouldShowBriefing(true, empty)).toBe(false);
    expect(shouldShowBriefing(false, pending)).toBe(false);
    expect(shouldShowBriefing(true, undefined)).toBe(false); // summary failed → fail-open to the app
  });
});
