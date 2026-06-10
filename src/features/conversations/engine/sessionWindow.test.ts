import { describe, expect, it } from "vitest";
import {
  computeSessionWindow,
  formatRemaining,
  pickWindowState,
  SESSION_WINDOW_MS,
} from "./sessionWindow";

const NOW = Date.parse("2026-06-10T12:00:00.000Z");

function isoHoursAgo(hours: number): string {
  return new Date(NOW - hours * 3_600_000).toISOString();
}

describe("computeSessionWindow", () => {
  it("evolution: window never applies and free text is always allowed", () => {
    const w = computeSessionWindow({ provider: "evolution", lastInboundAt: null, nowMs: NOW });
    expect(w.applies).toBe(false);
    expect(w.isOpen).toBe(true);
    expect(w.canSendFreeText).toBe(true);
    expect(w.state).toBe("open-fresh");
  });

  it("mock provider behaves like no-window (Fase 1 demo unaffected)", () => {
    const w = computeSessionWindow({
      provider: "mock",
      lastInboundAt: isoHoursAgo(30),
      nowMs: NOW,
    });
    expect(w.applies).toBe(false);
    expect(w.canSendFreeText).toBe(true);
  });

  it("meta with inbound 1h ago: open with 22h59min left", () => {
    const w = computeSessionWindow({ provider: "meta", lastInboundAt: isoHoursAgo(1), nowMs: NOW });
    expect(w.applies).toBe(true);
    expect(w.isOpen).toBe(true);
    expect(w.hoursLeft).toBe(23);
    expect(w.minutesLeft).toBe(0);
    expect(w.state).toBe("open-fresh");
    expect(w.closesAt).toBe(new Date(NOW + 23 * 3_600_000).toISOString());
  });

  it("meta with 23h59min elapsed: still open with 1 minute left, state open-closing", () => {
    const lastInboundAt = new Date(NOW - (SESSION_WINDOW_MS - 60_000)).toISOString();
    const w = computeSessionWindow({ provider: "meta", lastInboundAt, nowMs: NOW });
    expect(w.isOpen).toBe(true);
    expect(w.hoursLeft).toBe(0);
    expect(w.minutesLeft).toBe(1);
    expect(w.state).toBe("open-closing");
  });

  it("meta with exactly 24h elapsed: closed", () => {
    const w = computeSessionWindow({
      provider: "meta",
      lastInboundAt: isoHoursAgo(24),
      nowMs: NOW,
    });
    expect(w.isOpen).toBe(false);
    expect(w.state).toBe("closed");
    expect(w.msRemaining).toBe(0);
    expect(w.canSendFreeText).toBe(false);
  });

  it("meta without any inbound: window never opened (template required)", () => {
    const w = computeSessionWindow({ provider: "meta", lastInboundAt: null, nowMs: NOW });
    expect(w.applies).toBe(true);
    expect(w.isOpen).toBe(false);
    expect(w.state).toBe("closed");
    expect(w.closesAt).toBeNull();
    expect(w.canSendFreeText).toBe(false);
  });

  it("state thresholds: fresh > 12h, soon <= 12h, closing <= 1h", () => {
    expect(pickWindowState(13 * 3_600_000)).toBe("open-fresh");
    expect(pickWindowState(12 * 3_600_000)).toBe("open-soon");
    expect(pickWindowState(1 * 3_600_000)).toBe("open-closing");
    expect(pickWindowState(0)).toBe("closed");
  });

  it("formatRemaining truncates to minute precision (no seconds noise)", () => {
    expect(formatRemaining(8 * 3_600_000 + 27 * 60_000 + 59_000)).toEqual({
      hours: 8,
      minutes: 27,
    });
    expect(formatRemaining(0)).toEqual({ hours: 0, minutes: 0 });
    expect(formatRemaining(-5_000)).toEqual({ hours: 0, minutes: 0 });
  });
});
