import { describe, expect, it } from "vitest";
import { isFreshInboundTimestamp } from "./isFreshInboundTimestamp";

describe("isFreshInboundTimestamp", () => {
  const now = "2026-07-01T12:00:00.000Z";
  const recent = "2026-07-01T11:59:50.000Z"; // 10s before now

  it("is fresh with no prior alert and a recent candidate", () => {
    expect(isFreshInboundTimestamp(recent, null, now, 60_000)).toBe(true);
  });

  it("is not fresh when older than the last alerted timestamp", () => {
    const lastAlerted = "2026-07-01T11:59:55.000Z";
    expect(isFreshInboundTimestamp(recent, lastAlerted, now, 60_000)).toBe(false);
  });

  it("is not fresh when equal to the last alerted timestamp", () => {
    expect(isFreshInboundTimestamp(recent, recent, now, 60_000)).toBe(false);
  });

  it("is fresh when newer than the last alerted timestamp", () => {
    const lastAlerted = "2026-07-01T11:59:40.000Z";
    expect(isFreshInboundTimestamp(recent, lastAlerted, now, 60_000)).toBe(true);
  });

  it("is not fresh when the candidate is too old, even if newer than the last alert", () => {
    const old = "2026-07-01T11:00:00.000Z"; // 1h before now
    expect(isFreshInboundTimestamp(old, null, now, 60_000)).toBe(false);
  });
});
