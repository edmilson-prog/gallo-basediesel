import { describe, expect, it } from "vitest";
import type { IBusinessHoursWindow } from "@/shared/types";
import {
  DEFAULT_TIMEOUT_MINUTES,
  MAX_ACTIVATIONS_PER_TICK,
  decideActivations,
  type IBackstopCandidate,
  type IStorePilotConfig,
} from "./eligibility";

const STORE = "store-1";
// Monday 2026-07-20 15:00 local — inside the 08:00–18:00 window below.
const NOW = new Date("2026-07-20T15:00:00");

function candidate(overrides: Partial<IBackstopCandidate> = {}): IBackstopCandidate {
  return {
    conversationId: "conv-1",
    storeId: STORE,
    whatsappAccountId: "acc-1",
    lastInboundAt: new Date(NOW.getTime() - 10 * 60_000).toISOString(),
    ...overrides,
  };
}

function windowFor(now: Date): IBusinessHoursWindow {
  return {
    weekday: now.getDay() as IBusinessHoursWindow["weekday"],
    openAt: "08:00",
    closeAt: "18:00",
    enabled: true,
  };
}

function config(overrides: Partial<IStorePilotConfig> = {}): IStorePilotConfig {
  return { timeoutMinutes: 5, businessHours: [windowFor(NOW)], ...overrides };
}

describe("decideActivations", () => {
  it("activates a candidate that waited past the threshold within business hours", () => {
    const result = decideActivations([candidate()], new Map([[STORE, config()]]), NOW);
    expect(result.toActivate.map((c) => c.conversationId)).toEqual(["conv-1"]);
    expect(result.eligibleCount).toBe(1);
    expect(result.cappedCount).toBe(0);
  });

  it("skips a candidate still inside the threshold within business hours", () => {
    const fresh = candidate({
      lastInboundAt: new Date(NOW.getTime() - 2 * 60_000).toISOString(),
    });
    const result = decideActivations([fresh], new Map([[STORE, config()]]), NOW);
    expect(result.toActivate).toEqual([]);
    expect(result.eligibleCount).toBe(0);
  });

  it("uses threshold 0 outside configured business hours", () => {
    const night = new Date("2026-07-20T22:30:00");
    const justArrived = candidate({
      lastInboundAt: new Date(night.getTime() - 1_000).toISOString(),
    });
    const result = decideActivations(
      [justArrived],
      new Map([[STORE, config({ businessHours: [windowFor(night)] })]]),
      night,
    );
    expect(result.toActivate.map((c) => c.conversationId)).toEqual(["conv-1"]);
  });

  it("resolves missing/disabled business-hours windows to the CONSERVATIVE branch (threshold in minutes, never 0)", () => {
    const fresh = candidate({
      lastInboundAt: new Date(NOW.getTime() - 2 * 60_000).toISOString(),
    });
    const noWindows = decideActivations(
      [fresh],
      new Map([[STORE, config({ businessHours: [] })]]),
      NOW,
    );
    expect(noWindows.toActivate).toEqual([]);

    const disabledWindow = { ...windowFor(NOW), enabled: false };
    const allDisabled = decideActivations(
      [fresh],
      new Map([[STORE, config({ businessHours: [disabledWindow] })]]),
      NOW,
    );
    expect(allDisabled.toActivate).toEqual([]);
  });

  it("falls back to DEFAULT_TIMEOUT_MINUTES and the conservative branch when the store has no config", () => {
    const fresh = candidate({
      lastInboundAt: new Date(NOW.getTime() - (DEFAULT_TIMEOUT_MINUTES - 1) * 60_000).toISOString(),
    });
    const result = decideActivations([fresh], new Map(), NOW);
    expect(result.toActivate).toEqual([]);

    const waited = candidate({
      lastInboundAt: new Date(NOW.getTime() - (DEFAULT_TIMEOUT_MINUTES + 1) * 60_000).toISOString(),
    });
    expect(decideActivations([waited], new Map(), NOW).toActivate).toHaveLength(1);
  });

  it("caps activations per tick, FIFO by lastInboundAt, and reports the capped count", () => {
    const candidates = Array.from({ length: MAX_ACTIVATIONS_PER_TICK + 2 }, (_, i) =>
      candidate({
        conversationId: `conv-${i}`,
        // conv-0 waited the longest → must be first.
        lastInboundAt: new Date(NOW.getTime() - (60 - i) * 60_000).toISOString(),
      }),
    );
    const result = decideActivations(candidates, new Map([[STORE, config()]]), NOW);
    expect(result.toActivate).toHaveLength(MAX_ACTIVATIONS_PER_TICK);
    expect(result.toActivate[0].conversationId).toBe("conv-0");
    expect(result.eligibleCount).toBe(MAX_ACTIVATIONS_PER_TICK + 2);
    expect(result.cappedCount).toBe(2);
  });

  it("returns empty decision for no candidates", () => {
    expect(decideActivations([], new Map(), NOW)).toEqual({
      toActivate: [],
      eligibleCount: 0,
      cappedCount: 0,
    });
  });
});
